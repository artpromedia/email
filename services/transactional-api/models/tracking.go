package models

// GeoInfo represents geographic information from IP lookup
type GeoInfo struct {
Country     string  `json:"country"`
CountryCode string  `json:"country_code"`
Region      string  `json:"region"`
City        string  `json:"city"`
Latitude    float64 `json:"latitude"`
Longitude   float64 `json:"longitude"`
Timezone    string  `json:"timezone"`
}
