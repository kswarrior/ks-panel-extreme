FROM debian:bookworm-slim

# deps for `openssl rand` and HTTPS / ca certs
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# copy binaries from release folder
# if you build with `docker build -f release/Dockerfile .` from repo root, use: COPY release/kspanel ./kspanel
# if you build with `docker build ./release` (context = release/), use: COPY kspanel ./kspanel
COPY kspanel ./kspanel
COPY ksedge ./ksedge
RUN chmod +x ./kspanel ./ksedge || chmod +x ./kspanel

EXPOSE 10000 4040

# keep data persistent if you mount a volume
VOLUME ["/app/data"]

# Run the sequence you requested:
# 1. generate KSPANEL_SESSION_SECRET
# 2. chmod +x
# 3. seed / create user / import template / setup node / launch
# NOTE: removed trailing `&` from your commands - backgrounding would make
# the container exit immediately. Only the final `launch` should be foreground (exec).
# `|| true` allows re-runs to succeed if user/template/node already exists.
CMD ["sh", "-c", "export KSPANEL_SESSION_SECRET=\"${KSPANEL_SESSION_SECRET:-$(openssl rand -base64 32)}\" && echo \"KSPANEL_SESSION_SECRET=$KSPANEL_SESSION_SECRET\" && chmod +x ./kspanel && ./kspanel seed || true; ./kspanel create:user --username kshosting --email kshosting@ksmail.com --password \"kshosting@55\" --role 1 || true; ./kspanel import:template minecraft || true; ./kspanel setup:localnode --port 4040 || true; exec ./kspanel launch --port 10000"]
