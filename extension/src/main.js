const vscode = require('vscode');
const { execFile } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

// Constants
const PLATFORM_EXECUTABLES = {
  win32: 'proxy-win.exe',
  darwin: 'proxy-macos',
  linux: 'proxy-linux'
};

const SERVER_PORT = 51837;
const WEBVIEW_ID = 'telegramWebview';
const COMMAND_ID = 'telegram-vscode.openTelegramWeb';

let logger;
let serverProcess;

/**
 * Get the platform-specific server executable path
 * @returns {string} Path to server executable
 * @throws {Error} If platform is unsupported
 */
function getServerPath(context) {
  const platform = os.platform();
  const executable = PLATFORM_EXECUTABLES[platform];

  if (!executable) {
    throw new Error(`Unsupported platform: ${platform}`);
  }

  const serverPath = path.join(context.extensionPath, 'binaries', executable);
  
  if (!fs.existsSync(serverPath)) {
    throw new Error(`Server binary not found at: ${serverPath}`);
  }
  
  // Set rights for unix like systems
  if (platform !== 'win32') {
    try {
      fs.chmodSync(serverPath, 0o755);
      logger.appendLine(`Set executable permission for: ${serverPath}`);
    } catch (err) {
      logger.appendLine(`Warning: Could not set executable permission: ${err.message}`);
    }
  }
  
  return serverPath;
}

/**
 * Start the Telegram proxy server
 * @returns {Promise<void>}
 */
function startServer(context) {
  return new Promise((resolve, reject) => {
    try {
      const serverPath = getServerPath(context);
      
      logger.appendLine(`Starting server: ${serverPath}`);
      
      serverProcess = execFile(serverPath, (error, stdout, stderr) => {
        if (error) {
          logger.appendLine(`Error executing server: ${error.message}`);
          if (stderr) {
            logger.appendLine(`stderr: ${stderr}`);
          }
          return;
        }
        
        if (stdout) {
          logger.appendLine(`Server output: ${stdout}`);
        }
      });

      // Handle server process events
      serverProcess.on('error', (err) => {
        logger.appendLine(`Server process error: ${err.message}`);
        reject(err);
      });

      serverProcess.on('exit', (code, signal) => {
        logger.appendLine(`Server exited with code ${code} and signal ${signal}`);
      });
      
      setTimeout(() => {
        if (serverProcess && !serverProcess.killed) {
          logger.appendLine('Server process started successfully');
          resolve();
        } else {
          reject(new Error('Server process failed to start'));
        }
      }, 1000);
      
    } catch (error) {
      logger.appendLine(`Failed to start server: ${error.message}`);
      reject(error);
    }
  });
}

/**
 * Stop the server process if running
 */
function stopServer() {
  if (serverProcess && !serverProcess.killed) {
    logger.appendLine('Stopping server...');
    serverProcess.kill();
    serverProcess = null;
  }
}

/**
 * Generate HTML content for the webview
 * @returns {string} HTML content
 */
function getWebviewContent() {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src http://localhost:${SERVER_PORT}; script-src 'unsafe-inline';">
      <title>Telegram Web</title>
      <style>
        body, html {
          margin: 0;
          padding: 0;
          height: 100%;
          width: 100%;
          overflow: hidden;
        }
        iframe {
          border: none;
          height: 100%;
          width: 100%;
          display: block;
        }
        .loading {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          font-family: system-ui, -apple-system, sans-serif;
          color: #666;
        }
      </style>
    </head>
    <body>
      <div class="loading" id="loading">Loading Telegram...</div>
      <iframe 
        src="http://localhost:${SERVER_PORT}" 
        id="telegram-frame"
        allow="microphone; camera"
        sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
      ></iframe>
      <script>
        (function() {
          const vscode = acquireVsCodeApi();
          const iframe = document.getElementById('telegram-frame');
          const loading = document.getElementById('loading');

          iframe.addEventListener('load', () => {
            loading.style.display = 'none';
            vscode.postMessage({ 
              type: 'iframe-loaded',
              timestamp: Date.now()
            });
          });

          iframe.addEventListener('error', () => {
            loading.textContent = 'Failed to load Telegram. Please check if the server is running.';
            loading.style.color = '#f00';
          });

          window.addEventListener('message', (event) => {
            console.log('Received message from extension:', event.data);
          });
        })();
      </script>
    </body>
    </html>
  `;
}

/**
 * Create a webview panel for Telegram
 */
function createTelegramPanel() {
  const panel = vscode.window.createWebviewPanel(
    'telegramWebviewTab',
    'Telegram',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: []
    }
  );

  panel.webview.html = getWebviewContent();

  // Handle messages from the webview
  panel.webview.onDidReceiveMessage(
    (message) => {
      switch (message.type) {
        case 'iframe-loaded':
          logger.appendLine('Telegram iframe loaded successfully');
          break;
        default:
          logger.appendLine(`Unknown message type: ${message.type}`);
      }
    },
    undefined,
    []
  );

  panel.onDidDispose(
    () => {
      logger.appendLine('Telegram panel disposed');
    },
    undefined,
    []
  );

  return panel;
}

/**
 * Activate the extension
 * @param {vscode.ExtensionContext} context
 */
async function activate(context) {
  logger = vscode.window.createOutputChannel('Telegram-VSCode');
  logger.appendLine('Telegram VSCode extension activated');

  try {
    // Start the server
    await startServer(context);
    logger.appendLine('Server started successfully');
  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to start Telegram proxy server: ${error.message}`
    );
    logger.appendLine(`Server startup failed: ${error.message}`);
  }

  // Register command to open Telegram in a tab
  const openCommand = vscode.commands.registerCommand(
    COMMAND_ID,
    () => {
      try {
        createTelegramPanel();
      } catch (error) {
        vscode.window.showErrorMessage(
          `Failed to open Telegram: ${error.message}`
        );
        logger.appendLine(`Failed to create panel: ${error.message}`);
      }
    }
  );

  // Register webview view provider for sidebar
  const viewProvider = vscode.window.registerWebviewViewProvider(
    WEBVIEW_ID,
    {
      resolveWebviewView(webviewView) {
        webviewView.webview.options = {
          enableScripts: true,
          localResourceRoots: []
        };
        
        webviewView.webview.html = getWebviewContent();

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage((message) => {
          switch (message.type) {
            case 'iframe-loaded':
              logger.appendLine('Telegram sidebar iframe loaded successfully');
              break;
            default:
              logger.appendLine(`Unknown message type: ${message.type}`);
          }
        });
      }
    }
  );

  // Add to subscriptions
  context.subscriptions.push(
    openCommand,
    viewProvider,
    logger,
    {
      dispose: () => {
        stopServer();
      }
    }
  );
}

/**
 * Deactivate the extension
 */
function deactivate() {
  stopServer();
  if (logger) {
    logger.appendLine('Telegram VSCode extension deactivated');
    logger.dispose();
  }
}

module.exports = {
  activate,
  deactivate
};