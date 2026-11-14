# syntax=docker/dockerfile:1

# The runtime base matches the release runner (ubuntu-22.04) that builds the
# wrangl-server assets, so the binary loads the same library versions it was
# linked against.
ARG UBUNTU_VERSION=22.04

# 22.04 has no minisign package, so the download stage uses 24.04.
FROM ubuntu:24.04 AS fetch
ARG TARGETARCH
# A GitHub release tag (v0.1.0, nightly), or "latest" for the newest stable release.
ARG WRANGL_RELEASE=latest
RUN apt-get update \
	&& apt-get install -y --no-install-recommends ca-certificates curl minisign \
	&& rm -rf /var/lib/apt/lists/*
COPY src-tauri/tauri.conf.json /tmp/tauri.conf.json
WORKDIR /fetch
RUN set -eu; \
	case "$TARGETARCH" in \
		amd64) suffix= ;; \
		arm64) suffix=-linux-aarch64 ;; \
		*) echo "unsupported TARGETARCH: $TARGETARCH" >&2; exit 1 ;; \
	esac; \
	if [ "$WRANGL_RELEASE" = latest ]; then \
		base=https://github.com/wrangl-dev/wrangl/releases/latest/download; \
	else \
		base="https://github.com/wrangl-dev/wrangl/releases/download/$WRANGL_RELEASE"; \
	fi; \
	asset="wrangl-server$suffix"; \
	curl -fsSL --proto '=https' --retry 3 -o wrangl-server "$base/$asset" \
		|| { echo "no server asset in release $WRANGL_RELEASE" >&2; exit 1; }; \
	curl -fsSL --proto '=https' --retry 3 -o wrangl-server.sig "$base/$asset.sig"; \
	sed -n 's/.*"pubkey": *"\([^"]*\)".*/\1/p' /tmp/tauri.conf.json | base64 -d > minisign.pub; \
	base64 -d wrangl-server.sig > wrangl-server.minisig; \
	minisign -V -m wrangl-server -x wrangl-server.minisig -p minisign.pub; \
	chmod 0755 wrangl-server

FROM ubuntu:${UBUNTU_VERSION}
ARG WRANGL_RELEASE=latest
ARG WRANGL_UID=1000
ARG WRANGL_GID=1000

LABEL org.opencontainers.image.title="wrangl-server" \
	org.opencontainers.image.description="Standalone Wrangl server: browser terminals, git, and ACP agents over HTTP and WebSocket" \
	org.opencontainers.image.source="https://github.com/wrangl-dev/wrangl" \
	org.opencontainers.image.licenses="MIT" \
	org.opencontainers.image.version="${WRANGL_RELEASE}"

# wrangl-server links WebKitGTK and GTK through the shared Tauri crate even
# though the server never opens a window. The ldd check below fails the build
# if a linked library is missing.
RUN apt-get update \
	&& apt-get install -y --no-install-recommends \
		bash \
		ca-certificates \
		curl \
		git \
		less \
		libwebkit2gtk-4.1-0 \
		openssh-client \
		procps \
		tini \
	&& rm -rf /var/lib/apt/lists/* \
	&& groupadd --non-unique --gid "$WRANGL_GID" wrangl \
	&& useradd --non-unique --uid "$WRANGL_UID" --gid wrangl --create-home --shell /bin/bash wrangl \
	&& mkdir -p /home/wrangl/.local/bin /home/wrangl/.local/state/wrangl /workspace \
	&& chown -R wrangl:wrangl /home/wrangl /workspace

COPY --from=fetch /fetch/wrangl-server /usr/local/bin/wrangl-server
RUN if ldd /usr/local/bin/wrangl-server | grep 'not found'; then exit 1; fi

ENV HOME=/home/wrangl \
	PATH=/home/wrangl/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
	LANG=C.UTF-8

USER wrangl
WORKDIR /workspace
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
	CMD curl -fsS http://127.0.0.1:8080/health > /dev/null || exit 1

# A public bind with no WRANGL_WEB_AUTH_TOKEN makes the server generate a token
# into <state dir>/web-auth-token and refuse unauthenticated clients.
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/wrangl-server"]
CMD ["--host", "0.0.0.0", "--port", "8080", "--state-dir", "/home/wrangl/.local/state/wrangl"]
