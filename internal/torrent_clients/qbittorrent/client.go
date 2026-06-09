package qbittorrent

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"seanime/internal/torrent_clients/qbittorrent/application"
	"seanime/internal/torrent_clients/qbittorrent/log"
	"seanime/internal/torrent_clients/qbittorrent/rss"
	"seanime/internal/torrent_clients/qbittorrent/search"
	"seanime/internal/torrent_clients/qbittorrent/sync"
	"seanime/internal/torrent_clients/qbittorrent/torrent"
	"seanime/internal/torrent_clients/qbittorrent/transfer"
	"strings"
	std_sync "sync"

	"github.com/rs/zerolog"
	"golang.org/x/net/publicsuffix"
)

type Client struct {
	baseURL          string
	logger           *zerolog.Logger
	client           *http.Client
	Username         string
	Password         string
	Port             int
	Host             string
	Path             string
	DisableBinaryUse bool
	Tags             string
	Category         string
	Application      qbittorrent_application.Client
	Log              qbittorrent_log.Client
	RSS              qbittorrent_rss.Client
	Search           qbittorrent_search.Client
	Sync             qbittorrent_sync.Client
	Torrent          qbittorrent_torrent.Client
	Transfer         qbittorrent_transfer.Client
}

type NewClientOptions struct {
	Logger           *zerolog.Logger
	Username         string
	Password         string
	Port             int
	Host             string
	Path             string
	DisableBinaryUse bool
	Tags             string
	Category         string
}

func NewClient(opts *NewClientOptions) *Client {

	host := opts.Host
	scheme := "http"
	if strings.HasPrefix(host, "https://") {
		scheme = "https"
		host = strings.TrimPrefix(host, "https://")
	} else if strings.HasPrefix(host, "http://") {
		host = strings.TrimPrefix(host, "http://")
	}
	opts.Host = host

	var baseURL string
	if opts.Port > 0 {
		baseURL = fmt.Sprintf("%s://%s:%d/api/v2", scheme, host, opts.Port)
	} else {
		baseURL = fmt.Sprintf("%s://%s/api/v2", scheme, host)
	}

	client := &http.Client{}
	c := &Client{
		baseURL:          baseURL,
		logger:           opts.Logger,
		client:           client,
		Username:         opts.Username,
		Password:         opts.Password,
		Port:             opts.Port,
		Path:             opts.Path,
		DisableBinaryUse: opts.DisableBinaryUse,
		Host:             opts.Host,
		Tags:             opts.Tags,
		Category:         opts.Category,
		Application: qbittorrent_application.Client{
			BaseUrl: baseURL + "/app",
			Client:  client,
			Logger:  opts.Logger,
		},
		Log: qbittorrent_log.Client{
			BaseUrl: baseURL + "/log",
			Client:  client,
			Logger:  opts.Logger,
		},
		RSS: qbittorrent_rss.Client{
			BaseUrl: baseURL + "/rss",
			Client:  client,
			Logger:  opts.Logger,
		},
		Search: qbittorrent_search.Client{
			BaseUrl: baseURL + "/search",
			Client:  client,
			Logger:  opts.Logger,
		},
		Sync: qbittorrent_sync.Client{
			BaseUrl: baseURL + "/sync",
			Client:  client,
			Logger:  opts.Logger,
		},
		Torrent: qbittorrent_torrent.Client{
			BaseUrl: baseURL + "/torrents",
			Client:  client,
			Logger:  opts.Logger,
		},
		Transfer: qbittorrent_transfer.Client{
			BaseUrl: baseURL + "/transfer",
			Client:  client,
			Logger:  opts.Logger,
		},
	}

	c.client.Transport = &authedRoundTripper{
		wrapped: http.DefaultTransport,
		client:  c,
	}

	return c
}

func (c *Client) Login() error {
	endpoint := c.baseURL + "/auth/login"
	data := url.Values{}
	data.Add("username", c.Username)
	data.Add("password", c.Password)
	request, err := http.NewRequest("POST", endpoint, strings.NewReader(data.Encode()))
	if err != nil {
		return err
	}
	request.Header.Add("content-type", "application/x-www-form-urlencoded")
	request.Header.Add("Referer", c.baseURL)
	resp, err := c.client.Do(request)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return fmt.Errorf("invalid status %s", resp.Status)
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}
	if strings.TrimSpace(string(body)) == "Fails." {
		return fmt.Errorf("invalid username or password")
	}
	if len(resp.Cookies()) < 1 {
		return fmt.Errorf("no cookies in login response")
	}
	apiURL, err := url.Parse(c.baseURL)
	if err != nil {
		return err
	}
	jar, err := cookiejar.New(&cookiejar.Options{PublicSuffixList: publicsuffix.List})
	if err != nil {
		return err
	}
	jar.SetCookies(apiURL, []*http.Cookie{resp.Cookies()[0]})
	c.client.Jar = jar
	return nil
}

func (c *Client) Logout() error {
	endpoint := c.baseURL + "/auth/logout"
	request, err := http.NewRequest("POST", endpoint, nil)
	if err != nil {
		return err
	}
	resp, err := c.client.Do(request)
	if err != nil {
		return err
	}
	if resp.StatusCode != 200 {
		return fmt.Errorf("invalid status %s", resp.Status)
	}
	return nil
}

type authedRoundTripper struct {
	wrapped   http.RoundTripper
	client    *Client
	mu        std_sync.Mutex
	reauthing bool
	reauthErr error
	reauthCh  chan struct{}
}

// reauth ensures only one login attempt runs at a time. Concurrent callers wait
// for the in-progress login to finish and share its result rather than each
// hammering qBittorrent's auth endpoint (which triggers an IP ban).
func (art *authedRoundTripper) reauth() error {
	art.mu.Lock()
	if art.reauthing {
		// Another goroutine is already logging in; wait for it.
		ch := art.reauthCh
		art.mu.Unlock()
		<-ch
		art.mu.Lock()
		err := art.reauthErr
		art.mu.Unlock()
		return err
	}

	art.reauthing = true
	art.reauthCh = make(chan struct{})
	art.mu.Unlock()

	art.client.logger.Warn().Msg("qBittorrent: 403 Forbidden, attempting to re-authenticate")
	loginErr := art.client.Login()
	if loginErr != nil {
		art.client.logger.Err(loginErr).Msg("qBittorrent: failed to re-authenticate")
	}

	art.mu.Lock()
	art.reauthing = false
	art.reauthErr = loginErr
	close(art.reauthCh)
	art.mu.Unlock()

	return loginErr
}

func (art *authedRoundTripper) RoundTrip(req *http.Request) (*http.Response, error) {
	// Don't intercept login or logout requests to avoid infinite recursion
	if strings.Contains(req.URL.Path, "/auth/login") || strings.Contains(req.URL.Path, "/auth/logout") {
		return art.wrapped.RoundTrip(req)
	}

	// Read body so we can retry
	var bodyBytes []byte
	var err error
	if req.Body != nil {
		bodyBytes, err = io.ReadAll(req.Body)
		if err == nil {
			req.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))
		}
	}

	resp, err := art.wrapped.RoundTrip(req)
	if err != nil {
		return resp, err
	}

	if resp.StatusCode == http.StatusForbidden {
		resp.Body.Close()

		if loginErr := art.reauth(); loginErr != nil {
			return nil, loginErr
		}

		// Retry the request with the refreshed session cookie
		newReq := req.Clone(req.Context())
		if bodyBytes != nil {
			newReq.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))
		}
		newReq.Header.Del("Cookie")
		if art.client.client.Jar != nil {
			for _, cookie := range art.client.client.Jar.Cookies(newReq.URL) {
				newReq.AddCookie(cookie)
			}
		}

		return art.wrapped.RoundTrip(newReq)
	}

	return resp, err
}
