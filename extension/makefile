# Makefile for building VSCode extension tgcode

# Variables
BINARY_DIR=extension/binaries
EXTENSION_DIR=extension
VSCE=$(shell which vsce || echo "")
GO_FILES=server/proxy.go
VERSION=1.2.2

# Binary file names
BIN_WIN=$(BINARY_DIR)/proxy-win.exe
BIN_LINUX=$(BINARY_DIR)/proxy-linux
BIN_MAC=$(BINARY_DIR)/proxy-macos

.PHONY: all check-vsce build-binaries package install clean

# Build everything
all: check-vsce build-binaries package

# Check if vsce is installed, install if not
check-vsce:
ifeq ($(VSCE),)
	@echo "vsce not found, installing..."
	@npm install -g vsce
else
	@echo "vsce found"
	@vsce --version
endif

# Build cross-platform Go binaries
build-binaries:
	@echo "Creating binaries directory..."
	@mkdir -p $(BINARY_DIR)
	@echo "Building Windows binary..."
	GOOS=windows GOARCH=amd64 go build -o $(BIN_WIN) $(GO_FILES)
	@echo "Building Linux binary..."
	GOOS=linux GOARCH=amd64 go build -o $(BIN_LINUX) $(GO_FILES)
	@echo "Building macOS binary..."
	GOOS=darwin GOARCH=amd64 go build -o $(BIN_MAC) $(GO_FILES)
	@chmod +x $(BIN_LINUX) $(BIN_MAC)
	@echo "Binaries built successfully!"

# Package the VSCode extension into a .vsix file
package:
	@echo "Packaging VSIX..."
	@cd $(EXTENSION_DIR) && vsce package
	@echo "VSIX package is ready!"

# Install the local .vsix for testing
install:
	@echo "Installing local .vsix..."
	@code --install-extension $(EXTENSION_DIR)/tgcode-$(VERSION).vsix
	@echo "Installed!"

# Clean binaries and VSIX package
clean:
	@echo "Cleaning binaries and VSIX..."
	@rm -rf $(BINARY_DIR)/*.exe $(BINARY_DIR)/proxy-linux $(BINARY_DIR)/proxy-macos
	@rm -f $(EXTENSION_DIR)/tgcode-*.vsix
	@echo "Clean complete!"
