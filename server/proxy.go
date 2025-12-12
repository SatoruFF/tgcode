package main

import (
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"

	"github.com/labstack/echo/v4"
)

func main() {
	e := echo.New()

	targetURL, _ := url.Parse("https://web.telegram.org/k/")
	proxy := httputil.NewSingleHostReverseProxy(targetURL)

	originalDirector := proxy.Director
	proxy.Director = func(req *http.Request) {
		originalDirector(req)
		req.Header.Set("Origin", "https://web.telegram.org")
		req.Host = targetURL.Host
	}

	proxy.ModifyResponse = func(resp *http.Response) error {
		remove := []string{
			"X-Frame-Options",
			"Frame-Options",
			"Content-Security-Policy",
			"Content-Security-Policy-Report-Only",
			"Strict-Transport-Security",
		}
		for _, h := range remove {
			resp.Header.Del(h)
		}
		return nil
	}

	e.Any("/*", func(c echo.Context) error {
		req := c.Request()
		res := c.Response()

		proxy.ServeHTTP(res, req)
		return nil
	})

	log.Println("Proxy server running at http://localhost:51837")
	e.Logger.Fatal(e.Start(":51837"))
}
