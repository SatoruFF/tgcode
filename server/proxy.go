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
	fmt.Println("=== Telegram Proxy Server ===")

	e := echo.New()
	e.HideBanner = true
	
	// Middleware
	e.Use(middleware.Logger())
	e.Use(middleware.Recover())
	e.Use(middleware.CORSWithConfig(middleware.CORSConfig{
		AllowOrigins: []string{"*"},
		AllowMethods: []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders: []string{"*"},
	}))

	targetURL, err := url.Parse("https://web.telegram.org/k/")
	if err != nil {
		log.Fatal("ERROR: Failed to parse target URL:", err)
	}
	fmt.Println("Target URL:", targetURL.String())

	proxy := httputil.NewSingleHostReverseProxy(targetURL)
	originalDirector := proxy.Director

	proxy.Director = func(req *http.Request) {
		originalDirector(req)
		req.Header.Set("Origin", "https://web.telegram.org")
		req.Header.Set("Referer", "https://web.telegram.org/k/")
		req.Host = targetURL.Host
	}

	proxy.ModifyResponse = func(resp *http.Response) error {
		resp.Header.Del("X-Frame-Options")
		resp.Header.Del("Content-Security-Policy")
		resp.Header.Del("Content-Security-Policy-Report-Only")
		resp.Header.Del("Strict-Transport-Security")
		
		resp.Header.Set("Access-Control-Allow-Origin", "*")
		resp.Header.Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		resp.Header.Set("Access-Control-Allow-Headers", "*")
		return nil
	}

	proxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		log.Printf("PROXY ERROR: %v for %s %s\n", err, r.Method, r.URL.Path)
		http.Error(w, fmt.Sprintf("Proxy error: %v", err), http.StatusBadGateway)
	}

	// Health check
	e.GET("/health", func(c echo.Context) error {
		return c.String(http.StatusOK, "OK")
	})

	e.Any("/*", func(c echo.Context) error {
		proxy.ServeHTTP(c.Response(), c.Request())
		return nil
	})

	port := ":51837"
	fmt.Printf("Starting server on http://localhost%s\n", port)
	fmt.Println("Press Ctrl+C to stop")
	
	if err := e.Start(port); err != nil && err != http.ErrServerClosed {
		log.Fatal("ERROR: Server failed:", err)
	}
}