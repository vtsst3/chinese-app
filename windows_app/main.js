const { app, BrowserWindow, clipboard } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      contextIsolation: false,
    }
  });

  mainWindow.loadFile('index.html');

  // mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
  createWindow();

  let lastText = clipboard.readText();

  setInterval(() => {
    const currentText = clipboard.readText();
    if (currentText !== lastText) {
      lastText = currentText;
      // 中国語の文字範囲 (CJK Unified Ideographs)
      if (/[\u4e00-\u9fa5]/.test(currentText)) {
        if (mainWindow) {
          // ウィンドウをアクティブにする
          app.focus({ steal: true });
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.show();
          mainWindow.focus();
          mainWindow.flashFrame(true);

          // レンダラープロセスにクリップボードの内容を送信
          mainWindow.webContents.send('clipboard-updated', currentText);
        }
      }
    }
  }, 1000); // 1秒ごとにチェック

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
