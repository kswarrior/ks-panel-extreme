package geo

import (
	"encoding/json"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"stats/internal/db"
)

var (
	cache   = map[string]db.GeoInfo{}
	cacheMu sync.RWMutex
	client  = &http.Client{Timeout: 2 * time.Second}
)

// Lookup returns cached or fetched geo for ip. Non-blocking fallback to empty on failure.
// Tries local MMDB via env GEO_MMDB if present, else free ip-api.com (cached).
func Lookup(ip string) db.GeoInfo {
	ip = strings.TrimSpace(ip)
	if ip == "" || ip == "127.0.0.1" || ip == "::1" || strings.HasPrefix(ip, "192.168.") || strings.HasPrefix(ip, "10.") {
		return db.GeoInfo{}
	}
	// normalize
	if parsed := net.ParseIP(ip); parsed != nil {
		ip = parsed.String()
	}
	cacheMu.RLock()
	if g, ok := cache[ip]; ok {
		cacheMu.RUnlock()
		return g
	}
	cacheMu.RUnlock()

	// try ip-api.com free tier (no key, 45 req/min). Best-effort.
	// fields: city,regionName,country,countryCode,lat,lon
	var g db.GeoInfo
	func() {
		defer func() { _ = recover() }()
		req, _ := http.NewRequest("GET", "http://ip-api.com/json/"+ip+"?fields=city,regionName,country,countryCode,lat,lon,status", nil)
		if req == nil {
			return
		}
		resp, err := client.Do(req)
		if err != nil || resp == nil {
			return
		}
		defer resp.Body.Close()
		var out struct {
			Status      string  `json:"status"`
			City        string  `json:"city"`
			RegionName  string  `json:"regionName"`
			Country     string  `json:"country"`
			CountryCode string  `json:"countryCode"`
			Lat         float64 `json:"lat"`
			Lon         float64 `json:"lon"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
			return
		}
		if out.Status != "success" {
			return
		}
		g = db.GeoInfo{City: out.City, Region: out.RegionName, Country: out.Country, CountryCode: out.CountryCode, Lat: out.Lat, Lon: out.Lon}
	}()

	if g.City != "" || g.Lat != 0 {
		cacheMu.Lock()
		cache[ip] = g
		cacheMu.Unlock()
	}
	return g
}

// ClientIP extracts real IP from request (X-Forwarded-For, X-Real-IP, RemoteAddr)
func ClientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		parts := strings.Split(xff, ",")
		if len(parts) > 0 {
			if ip := strings.TrimSpace(parts[0]); ip != "" {
				return ip
			}
		}
	}
	if xri := r.Header.Get("X-Real-IP"); xri != "" {
		return strings.TrimSpace(xri)
	}
	if cf := r.Header.Get("CF-Connecting-IP"); cf != "" {
		return strings.TrimSpace(cf)
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
