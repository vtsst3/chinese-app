const { app, BrowserWindow, clipboard, ipcMain } = require('electron');
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

  mainWindow.on('close', (event) => {
    event.preventDefault();
    mainWindow.hide();
  });

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
      const isXmlTag = /^<.*>$/s.test(currentText);
      const hasKanji = /[\u4e00-\u9fa5]/.test(currentText);

      // 末尾5文字にひらがな・カタカナが含まれているかチェック
      const last5Chars = currentText.slice(-5);
      const hasKanaInLast5 = /[\u3040-\u309F\u30A0-\u30FF]/.test(last5Chars);

      // 条件: XMLタグでなく、漢字を含み、かつ、末尾5文字にかなが含まれていない
      if (!isXmlTag && hasKanji && !hasKanaInLast5) {
        if (mainWindow) {
          // 条件を満たしたら、レンダラープロセスにクリップボードの内容を無条件に送信
          mainWindow.webContents.send('clipboard-updated', currentText);
        }
      }
    }
  }, 1000); // 1秒ごとにチェック

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  // レンダラープロセスからのウィンドウ表示要求をリッスン
  ipcMain.on('show-window', () => {
    if (mainWindow) {
      if (!mainWindow.isVisible()) {
        mainWindow.show();
      }
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      // ここではフォーカスを奪わない
    }
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
