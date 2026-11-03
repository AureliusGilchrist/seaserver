package core

import (
	"crypto/x509"
	"encoding/pem"
	"os"
	"path/filepath"
	"testing"

	"github.com/rs/zerolog"
)

func TestSelfSignedCertCoversLANAndIsKept(t *testing.T) {
	dir := t.TempDir()
	certPath := filepath.Join(dir, "cert.pem")
	keyPath := filepath.Join(dir, "key.pem")
	logger := zerolog.Nop()

	if err := generateSelfSignedCert(certPath, keyPath, &logger); err != nil {
		t.Fatal(err)
	}
	data, _ := os.ReadFile(certPath)
	block, _ := pem.Decode(data)
	cert, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		t.Fatal(err)
	}
	if len(cert.IPAddresses) < 2 || len(cert.DNSNames) < 1 {
		t.Fatalf("missing SANs: %v %v", cert.DNSNames, cert.IPAddresses)
	}
	if selfSignedCertNeedsRenewal(certPath) {
		t.Fatal("a fresh certificate should not need renewal")
	}

	// A second call keeps the existing (still valid) certificate
	if err := generateSelfSignedCert(certPath, keyPath, &logger); err != nil {
		t.Fatal(err)
	}
	again, _ := os.ReadFile(certPath)
	if string(again) != string(data) {
		t.Fatal("valid certificate was replaced")
	}
}

func TestForeignCertNeverRenewed(t *testing.T) {
	if selfSignedCertNeedsRenewal(filepath.Join(t.TempDir(), "missing.pem")) {
		t.Fatal("unreadable certificate should be left alone")
	}
}
