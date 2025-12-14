package main

import (
	"fmt"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"

	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
)

func main() {
	log.SetOutput(os.Stdout)
	log.SetFlags(log.LstdFlags | log.Lshortfile)

	e := echo.New()
	e.HideBanner = true

	// logs
	e.Use(middleware.Logger())
	e.Use(middleware.Recover())

	// CORS middleware
	e.Use(middleware.CORSWithConfig(middleware.CORSConfig{
		AllowOrigins: []string{"*"},
		AllowMethods: []string{http.MethodGet, http.MethodHead, http.MethodPut, http.MethodPatch, http.MethodPost, http.MethodDelete},
		AllowHeaders: []string{"*"},
	}))

	targetURL, err := url.Parse("https://web.telegram.org/k/")
	if err != nil {
		log.Fatal("Failed to parse target URL:", err)
	}

	proxy := httputil.NewSingleHostReverseProxy(targetURL)
	originalDirector := proxy.Director

	proxy.Director = func(req *http.Request) {
		originalDirector(req)
		req.Header.Set("Origin", "https://web.telegram.org")
		req.Header.Set("Referer", "https://web.telegram.org/k/")
		req.Host = targetURL.Host
		log.Printf("Proxying request: %s %s", req.Method, req.URL.Path)
	}

	proxy.ModifyResponse = func(resp *http.Response) error {
		// Removing the headers that interfere with embedding in the iframe
		headersToRemove := []string{
			"X-Frame-Options",
			"Frame-Options",
			"Content-Security-Policy",
			"Content-Security-Policy-Report-Only",
			"Strict-Transport-Security",
		}
		for _, h := range headersToRemove {
			resp.Header.Del(h)
		}

		// for ifreame
		resp.Header.Set("Access-Control-Allow-Origin", "*")
		resp.Header.Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		resp.Header.Set("Access-Control-Allow-Headers", "*")

		return nil
	}

	proxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		log.Printf("Proxy error: %v", err)
		http.Error(w, fmt.Sprintf("Proxy error: %v", err), http.StatusBadGateway)
	}

	e.Any("/*", func(c echo.Context) error {
		proxy.ServeHTTP(c.Response(), c.Request())
		return nil
	})

	port := ":51837"
	log.Printf("Starting Telegram proxy server on http://localhost%s", port)
	log.Println("Proxying requests to https://web.telegram.org/k/")
	
	if err := e.Start(port); err != nil && err != http.ErrServerClosed {
		log.Fatal("Server failed to start:", err)
	}
}