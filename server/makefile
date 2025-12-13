IMAGE_NAME = tg-proxy
PORT = 51837

build:
	docker build -t $(IMAGE_NAME) .

run:
	docker run -it --rm -p $(PORT):$(PORT) $(IMAGE_NAME)

rebuild: build run

clean:
	docker rm -f $(shell docker ps -aq --filter "ancestor=$(IMAGE_NAME)") || true

logs:
	docker logs -f $(shell docker ps -q --filter "ancestor=$(IMAGE_NAME)")

oldmacexe:
	GOOS=darwin GOARCH=amd64 go build -o proxy-macos proxy.go

# Build individual binaries
macexe:
	GOOS=darwin GOARCH=arm64 go build -o proxy-macos proxy.go

linexe:
	GOOS=linux GOARCH=amd64 go build -o proxy-linux proxy.go

winexe:
	GOOS=windows GOARCH=amd64 go build -o proxy-win.exe proxy.go

# Build all binaries at once
all-binaries: macexe linexe winexe
	@echo "All binaries built successfully!"