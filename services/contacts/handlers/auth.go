package handlers

import (
	"context"
	"encoding/base64"
	"net/http"
	"strings"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

type AuthMiddleware struct {
	jwtSecret []byte
}

func NewAuthMiddleware(jwtSecret string) *AuthMiddleware {
	return &AuthMiddleware{
		jwtSecret: []byte(jwtSecret),
	}
}

// JWTAuth validates JWT tokens for REST API
func (m *AuthMiddleware) JWTAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			writeError(w, http.StatusUnauthorized, "Missing authorization header")
			return
		}

		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
			writeError(w, http.StatusUnauthorized, "Invalid authorization header")
			return
		}

		token, err := jwt.Parse(parts[1], func(token *jwt.Token) (interface{}, error) {
			return m.jwtSecret, nil
		})

		if err != nil || !token.Valid {
			writeError(w, http.StatusUnauthorized, "Invalid token")
			return
		}

		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			writeError(w, http.StatusUnauthorized, "Invalid token claims")
			return
		}

		userIDStr, ok := claims["sub"].(string)
		if !ok {
			writeError(w, http.StatusUnauthorized, "Invalid user ID")
			return
		}

		userID, err := uuid.Parse(userIDStr)
		if err != nil {
			writeError(w, http.StatusUnauthorized, "Invalid user ID format")
			return
		}

		ctx := context.WithValue(r.Context(), "user_id", userID)

		if email, ok := claims["email"].(string); ok {
			ctx = context.WithValue(ctx, "email", email)
		}

		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// BasicAuth validates Basic auth for CardDAV clients
func (m *AuthMiddleware) BasicAuth(validateFunc func(username, password string) (uuid.UUID, error)) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" {
				w.Header().Set("WWW-Authenticate", `Basic realm="CardDAV"`)
				writeError(w, http.StatusUnauthorized, "Authorization required")
				return
			}

			parts := strings.Split(authHeader, " ")
			if len(parts) != 2 || strings.ToLower(parts[0]) != "basic" {
				w.Header().Set("WWW-Authenticate", `Basic realm="CardDAV"`)
				writeError(w, http.StatusUnauthorized, "Invalid authorization header")
				return
			}

			decoded, err := base64.StdEncoding.DecodeString(parts[1])
			if err != nil {
				w.Header().Set("WWW-Authenticate", `Basic realm="CardDAV"`)
				writeError(w, http.StatusUnauthorized, "Invalid credentials encoding")
				return
			}

			credentials := strings.SplitN(string(decoded), ":", 2)
			if len(credentials) != 2 {
				w.Header().Set("WWW-Authenticate", `Basic realm="CardDAV"`)
				writeError(w, http.StatusUnauthorized, "Invalid credentials format")
				return
			}

			userID, err := validateFunc(credentials[0], credentials[1])
			if err != nil {
				w.Header().Set("WWW-Authenticate", `Basic realm="CardDAV"`)
				writeError(w, http.StatusUnauthorized, "Invalid username or password")
				return
			}

			ctx := context.WithValue(r.Context(), "user_id", userID)
			ctx = context.WithValue(ctx, "email", credentials[0])
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// CombinedAuth tries JWT first, falls back to Basic
func (m *AuthMiddleware) CombinedAuth(validateBasic func(username, password string) (uuid.UUID, error)) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" {
				w.Header().Set("WWW-Authenticate", `Basic realm="CardDAV"`)
				writeError(w, http.StatusUnauthorized, "Authorization required")
				return
			}

			parts := strings.Split(authHeader, " ")
			if len(parts) != 2 {
				writeError(w, http.StatusUnauthorized, "Invalid authorization header")
				return
			}

			authType := strings.ToLower(parts[0])

			switch authType {
			case "bearer":
				token, err := jwt.Parse(parts[1], func(token *jwt.Token) (interface{}, error) {
					return m.jwtSecret, nil
				})
				if err != nil || !token.Valid {
					writeError(w, http.StatusUnauthorized, "Invalid token")
					return
				}

				claims, ok := token.Claims.(jwt.MapClaims)
				if !ok {
					writeError(w, http.StatusUnauthorized, "Invalid token claims")
					return
				}

				userIDStr, ok := claims["sub"].(string)
				if !ok {
					writeError(w, http.StatusUnauthorized, "Invalid user ID")
					return
				}

				userID, err := uuid.Parse(userIDStr)
				if err != nil {
					writeError(w, http.StatusUnauthorized, "Invalid user ID format")
					return
				}

				ctx := context.WithValue(r.Context(), "user_id", userID)
				if email, ok := claims["email"].(string); ok {
					ctx = context.WithValue(ctx, "email", email)
				}
				next.ServeHTTP(w, r.WithContext(ctx))

			case "basic":
				decoded, err := base64.StdEncoding.DecodeString(parts[1])
				if err != nil {
					w.Header().Set("WWW-Authenticate", `Basic realm="CardDAV"`)
					writeError(w, http.StatusUnauthorized, "Invalid credentials")
					return
				}

				credentials := strings.SplitN(string(decoded), ":", 2)
				if len(credentials) != 2 {
					w.Header().Set("WWW-Authenticate", `Basic realm="CardDAV"`)
					writeError(w, http.StatusUnauthorized, "Invalid credentials")
					return
				}

				userID, err := validateBasic(credentials[0], credentials[1])
				if err != nil {
					w.Header().Set("WWW-Authenticate", `Basic realm="CardDAV"`)
					writeError(w, http.StatusUnauthorized, "Invalid username or password")
					return
				}

				ctx := context.WithValue(r.Context(), "user_id", userID)
				ctx = context.WithValue(ctx, "email", credentials[0])
				next.ServeHTTP(w, r.WithContext(ctx))

			default:
				writeError(w, http.StatusUnauthorized, "Unsupported authorization type")
			}
		})
	}
}
