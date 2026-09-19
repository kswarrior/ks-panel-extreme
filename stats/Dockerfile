# syntax=docker/dockerfile:1

# ---- builder ----
FROM golang:1.25-bookworm AS builder
# fallback if 1.25-bookworm not yet on your mirror: golang:1.25-alpine or golang:bookworm

WORKDIR /src

# cache deps first
COPY go.mod go.sum ./
RUN go mod download

# copy source (embed needs web/index.html + internal/* + cmd/*)
COPY . .

# pure Go sqlite (modernc.org/sqlite) -> no CGO, static binary ~12-18MB
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/stats ./cmd/server \
 && ls -lh /out/stats

# ---- runtime ----
# distroless/static is smallest (~2MB + 15MB binary = ~17MB) but has no shell/healthcheck.
# alpine is ~7MB and gives you wget/busybox shell for HEALTHCHECK + ca-certificates.
# If you prefer distroless, swap FROM to gcr.io/distroless/static-debian12:nonroot
FROM alpine:3.21

RUN apk add --no-cache ca-certificates \
 && update-ca-certificates

WORKDIR /app

# copy static binary
COPY --from=builder /out/stats ./stats
RUN chmod +x ./stats

# non-root (optional but recommended)
RUN adduser -D -u 10001 stats \
 && mkdir -p /data \
 && chown stats:stats /data
USER stats

# defaults — override with `docker run -e ...` or compose env_file
ENV STATS_PORT=9090 \
    STATS_DB=/data/stats.db \
    PORT=9090
# owner auth — MUST set in production:
# ENV STATS_ADMIN_PASSWORD=changeme
# ENV STATS_ADMIN_USER=admin
# optional per-panel PSK — if set, panels must send ?token= or X-Panel-Token
# ENV STATS_PANEL_TOKEN=

EXPOSE 9090
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${STATS_PORT:-9090}/health | grep -q '"ok":true' || exit 1

# env takes precedence over --port flag; db path via STATS_DB / STATS_DB_PATH
ENTRYPOINT ["./stats"]
# no CMD args needed — port/db read from env. Add `--port 9090` here if you want CLI override:
# CMD ["--port", "9090"]
