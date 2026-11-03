package core

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"math/big"
	"net"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/rs/zerolog"
)

// selfSignedOrg marks certificates this server generated itself, so only those are ever
// replaced; a certificate the user supplied is never touched.
const selfSignedOrg = "Deus Ex Aeternae Self-Signed"

// selfSignedRenewBefore is how long before expiry a self-generated certificate is replaced.
const selfSignedRenewBefore = 30 * 24 * time.Hour

func generateSelfSignedCert(certPath, keyPath string, logger *zerolog.Logger) error {
	// Keep existing files, unless they are our own self-signed certificate and it is about to
	// expire (an expired certificate makes every HTTPS client refuse the server).
	if _, err := os.Stat(certPath); !os.IsNotExist(err) {
		if _, err := os.Stat(keyPath); !os.IsNotExist(err) {
			if !selfSignedCertNeedsRenewal(certPath) {
				return nil
			}
			logger.Info().Msg("app: Self-signed TLS certificate expires soon, replacing it")
		}
	}

	logger.Info().Msg("app: Generating new self-signed TLS certificate and key")

	if err := os.MkdirAll(filepath.Dir(certPath), 0755); err != nil {
		return err
	}

	// generate private key with ECDSA (P256)
	privKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return err
	}

	serialNumberLimit := new(big.Int).Lsh(big.NewInt(1), 128)
	serialNumber, err := rand.Int(rand.Reader, serialNumberLimit)
	if err != nil {
		return err
	}

	template := x509.Certificate{
		SerialNumber: serialNumber,
		Subject: pkix.Name{
			Organization: []string{selfSignedOrg},
			CommonName:   "localhost",
		},
		NotBefore:             time.Now().Add(-time.Hour), // tolerate small clock skew on clients
		NotAfter:              time.Now().AddDate(1, 0, 0),
		KeyUsage:              x509.KeyUsageKeyEncipherment | x509.KeyUsageDigitalSignature,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		BasicConstraintsValid: true,
	}
	// Cover the names and addresses LAN clients actually use to reach the server, not only
	// localhost, so a client connecting by the NAS's IP or hostname can validate the certificate.
	template.DNSNames, template.IPAddresses = certSubjectAltNames()

	// Create certificate
	certBytes, err := x509.CreateCertificate(rand.Reader, &template, &template, &privKey.PublicKey, privKey)
	if err != nil {
		return err
	}

	// Save certificate
	certOut, err := os.Create(certPath)
	if err != nil {
		return err
	}
	if err := pem.Encode(certOut, &pem.Block{Type: "CERTIFICATE", Bytes: certBytes}); err != nil {
		_ = certOut.Close()
		return err
	}
	if err := certOut.Close(); err != nil {
		return err
	}
	logger.Debug().Msgf("app: Wrote TLS certificate to %s", certPath)

	// Save private key
	keyOut, err := os.OpenFile(keyPath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0600)
	if err != nil {
		return err
	}
	// Marshal ECDSA key to SEC 1, ASN.1 DER form
	privKeyBytes, err := x509.MarshalECPrivateKey(privKey)
	if err != nil {
		_ = keyOut.Close()
		return err
	}
	if err := pem.Encode(keyOut, &pem.Block{Type: "EC PRIVATE KEY", Bytes: privKeyBytes}); err != nil {
		_ = keyOut.Close()
		return err
	}
	if err := keyOut.Close(); err != nil {
		return err
	}
	logger.Debug().Msgf("app: Wrote TLS private key to %s", keyPath)

	return nil
}

// selfSignedCertNeedsRenewal reports whether certPath holds a certificate this server generated
// that has expired or expires within selfSignedRenewBefore. Unreadable or foreign certificates
// report false and are left alone.
func selfSignedCertNeedsRenewal(certPath string) bool {
	data, err := os.ReadFile(certPath)
	if err != nil {
		return false
	}
	block, _ := pem.Decode(data)
	if block == nil {
		return false
	}
	cert, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		return false
	}
	ours := false
	for _, org := range cert.Subject.Organization {
		if strings.HasSuffix(org, "Self-Signed") {
			ours = true
		}
	}
	return ours && time.Until(cert.NotAfter) < selfSignedRenewBefore
}

// certSubjectAltNames lists localhost, this machine's hostname, and every unicast address
// on its network interfaces.
func certSubjectAltNames() ([]string, []net.IP) {
	dnsNames := []string{"localhost"}
	if host, err := os.Hostname(); err == nil && host != "" {
		host = strings.ToLower(host)
		dnsNames = append(dnsNames, host)
		if !strings.Contains(host, ".") {
			dnsNames = append(dnsNames, host+".local")
		}
	}

	ips := []net.IP{net.ParseIP("127.0.0.1"), net.ParseIP("::1")}
	seen := map[string]bool{"127.0.0.1": true, "::1": true}
	if addrs, err := net.InterfaceAddrs(); err == nil {
		for _, addr := range addrs {
			ipNet, ok := addr.(*net.IPNet)
			if !ok || ipNet.IP == nil || ipNet.IP.IsMulticast() || ipNet.IP.IsUnspecified() {
				continue
			}
			if key := ipNet.IP.String(); !seen[key] {
				seen[key] = true
				ips = append(ips, ipNet.IP)
			}
		}
	}
	return dnsNames, ips
}
