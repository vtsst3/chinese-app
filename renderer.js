// --- DOM要素の取得 ---
const apiKeyInput = document.getElementById('gemini-api-key-input');
const saveKeysBtn = document.getElementById('save-keys-btn');
const copyLogBtn = document.getElementById('copy-log-btn');
const textInput = document.getElementById('text-input');
const chineseOutput = document.getElementById('chinese-output');
const geminiOutput = document.getElementById('gemini-output');
const translateBtn = document.getElementById('translate-btn');
const clearInputBtn = document.getElementById('clear-input-btn');
const clearBtn = document.getElementById('clear-btn');
const speakBtn = document.getElementById('speak-btn');
const pasteBtn = document.getElementById('paste-btn');
const settingsBtn = document.getElementById('settings-btn');
const apiKeySection = document.getElementById('api-key-section');

// --- グローバル変数 ---
let geminiApiKey = '';
let chatHistory = [];
let cnToJpPrompt = '';
let jpToCnPrompt = '';
let lastRequestLog = '';
let polly;
let audioContext; // Web Audio APIのコンテキスト
let currentAudioSource = null; // 現在再生中のAudioBufferSourceNode
const audioCache = new Map();
let lastSpokenText = '';
let lastAutoSpokenContext = ''; // 最後に自動再生したContextを記憶
let inputDebounceTimer;
let abortController = null; // AbortControllerを保持する変数
let speechQueue = [];
let isSpeaking = false;
let speechTimer = null; // ポーズ用のタイマーID
let dictionaryPopup;
let overlay; // オーバーレイ要素を保持する変数
let isPopupVisible = false;

// --- ここからピンイン変換ロジック ---
const dictionary = new Map();
const customWordRules = new Map();
const fixedWordRules = new Map([
    ['了解', 'liao3 jie3'], ['受不了', 'shou4 bu4 liao3'], ['来得了', 'lai2 de5 liao3'],
    ['得到', 'de2 dao4'], ['得分', 'de2 fen1'],
    ['还钱', 'huan2 qian2'], ['还书', 'huan2 shu1'],
    ['银行', 'yin2 hang2'], ['行业', 'hang2 ye4'], ['一行', 'yi4 hang2'], ['不行', 'bu4 xing2'],
    ['爱好', 'ai4 hao4'], ['好学', 'hao4 xue2'],
    ['长大', 'zhang3 da4'], ['校长', 'xiao4 zhang3'], ['长城', 'Chang2 cheng2'],
    ['首都', 'shou3 du1'], ['都市', 'du1 shi4'],
    ['快乐', 'kuai4 le4'], ['音乐', 'yin1 yue4'],
    ['重要', 'zhong4 yao4'], ['重新', 'chong2 xin1'], ['重複', 'chong2 fu4'],
    ['身分', 'shen1 fen4'], ['分内', 'fen4 nei4'], ['分量', 'fen4 liang4'],
    ['假如', 'jia3 ru2'], ['放假', 'fang4 jia4'], ['假期', 'jia4 qī'],
    ['教书', 'jiao1 shu1'], ['教室', 'jiao4 shi4'], ['教育', 'jiao4 yu4'], ['佛教', 'Fo2 jiao4'],
    ['背包', 'bei1 bao1'], ['后背', 'hou4 bei4'], ['背书', 'bei4 shu1'],
    ['下降', 'xia4 jiang4'], ['降价', 'jiang4 jia4'], ['投降', 'tou2 xiang2'],
    ['盛饭', 'cheng2 fan4'], ['盛大', 'sheng4 da4'], ['茂盛', 'mao4 sheng4'],
    ['薄纸', 'bao2 zhi3'], ['薄情', 'bo2 qing2'], ['微薄', 'wei1 bo2'], ['薄荷', 'bo4 he5'],
    ['着急', 'zhao2 ji2'], ['高着', 'gao1 zhao1'], ['公司', 'gong1 si1'],
    ['积累', 'ji1 lei3'], ['累计', 'lei3 ji4'], ['牵累', 'qian1 lei3'], ['硕果累累', 'shuo4 guo3 lei3 lei3'], ['劳累', 'lao2 lei4']
]);
const subjectList = new Set(['我', '你', '他', '她', '它', '我们', '你们', '他们']);
const verbList = new Set(['是', '看', '说', '有', '去', '吃', '喝', '写', '听', '拿', '坐', '走', '跑', '穿', '想', '爱', '学', '做', '买', '卖', '開', '关', '盛']);
const nounList = new Set(['钱', '书', '東西', '衣服']);
const charDefaultRules = new Map([
    ['着', 'zhe5'], ['得', 'de5'], ['了', 'le5'], ['还', 'hai2'], ['都', 'dou1'], ['行', 'xing2'], ['累', 'lei4']
]);
const pinyinToneMap = { 'a': ['ā', 'á', 'ǎ', 'à', 'a'], 'e': ['ē', 'é', 'ě', 'è', 'e'], 'i': ['ī', 'í', 'ǐ', 'ì', 'i'], 'o': ['ō', 'ó', 'ǒ', 'ò', 'o'], 'u': ['ū', 'ú', 'ǔ', 'ù', 'u'], 'ü': ['ǖ', 'ǘ', 'ǚ', 'ǜ', 'ü'] };
function convertPinyin(pinyinWithNumber) { if (!pinyinWithNumber) return ''; pinyinWithNumber = pinyinWithNumber.toLowerCase().replace('u:', 'ü'); return pinyinWithNumber.replace(/([a-z]+[ü]?)([1-5])/i, (match, syllable, toneNum) => { const tone = parseInt(toneNum) - 1; if (tone < 0 || tone > 4) return syllable; if (syllable === 'm' || syllable === 'n' || syllable === 'ng') return syllable; const aPos = syllable.indexOf('a'); const ePos = syllable.indexOf('e'); const oPos = syllable.indexOf('o'); if (aPos !== -1) return syllable.replace('a', pinyinToneMap['a'][tone]); if (ePos !== -1) return syllable.replace('e', pinyinToneMap['e'][tone]); if (oPos !== -1) return syllable.replace('o', pinyinToneMap['o'][tone]); for (let i = syllable.length - 1; i >= 0; i--) { if ('iüu'.includes(syllable[i])) { return syllable.slice(0, i) + pinyinToneMap[syllable[i]][tone] + syllable.slice(i + 1); } } return syllable; }); }

async function loadDictionaries() {
  try {
    const response = await fetch('cedict_ts.u8');
    const fileContent = await response.text();
    fileContent.split('\n').forEach(line => {
      if (line.startsWith('#') || line.trim() === '') return;
      const match = line.match(/^\S+\s(\S+)\s\[(.*?)\]\s\/(.*)\//);
      if (match) {
        const [, simplified, pinyin, definition] = match;
        if (!dictionary.has(simplified)) dictionary.set(simplified, []);
        dictionary.get(simplified).push({ pinyin, definition });
      }
    });
    console.log(`CEDICT loaded. ${dictionary.size} unique words.`);
  } catch (error) { console.error('Failed to load CEDICT:', error); }

  try {
    const response = await fetch('custom_dict.txt');
    if (response.ok) {
        const fileContent = await response.text();
        fileContent.split('\n').forEach(line => {
            if (line.trim() === '') return;
            const parts = line.split(/\s+/);
            if (parts.length >= 2) {
                const [word, ...pinyin] = parts;
                customWordRules.set(word, pinyin.join(' '));
            }
        });
        console.log(`Custom dictionary loaded. ${customWordRules.size} rules.`);
    }
  } catch (error) { console.error('Failed to load custom dictionary:', error); }
}

function processText(text) {
    const segments = [];
    let i = 0;
    while (i < text.length) {
        let foundWord = '';
        const remainingText = text.substring(i);
        const englishMatch = remainingText.match(/^[a-zA-Z]+/);
        if (englishMatch) {
            foundWord = englishMatch[0];
        } else {
            const puncMatch = remainingText.match(/^[^\u4e00-\u9fa5a-zA-Z0-9]+/);
            if (puncMatch) {
                foundWord = puncMatch[0];
            } else {
                const numMatch = remainingText.match(/^[0-9:.]+/);
                if (numMatch) {
                    foundWord = numMatch[0];
                } else {
                    for (const ruleWord of Array.from(customWordRules.keys()).sort((a,b) => b.length - a.length)) { if (remainingText.startsWith(ruleWord)) { foundWord = ruleWord; break; } }
                    if (!foundWord) { for (const ruleWord of Array.from(fixedWordRules.keys()).sort((a,b) => b.length - a.length)) { if (remainingText.startsWith(ruleWord)) { foundWord = ruleWord; break; } } }
                    if (!foundWord) { for (let j = Math.min(10, remainingText.length); j > 0; j--) { const sub = remainingText.substring(0, j); if (dictionary.has(sub)) { foundWord = sub; break; } } }
                }
            }
        }
        if (!foundWord) { foundWord = text[i]; }
        segments.push(foundWord);
        i += foundWord.length;
    }
    
    const finalResult = [];
    for (let i = 0; i < segments.length; i++) {
        const currentWord = segments[i];
        const isEnglish = /^[a-zA-Z]+$/.test(currentWord);
        const isPunctuation = /^[^\u4e00-\u9fa5a-zA-Z0-9]+$/.test(currentWord);
        const isNumber = /^[0-9:.]+$/.test(currentWord);

        if (isEnglish) { finalResult.push({ word: currentWord, chars: null, isEnglish: true }); continue; }
        if (isPunctuation) { finalResult.push({ word: currentWord, chars: null, isPunctuation: true }); continue; }
        if (isNumber) { finalResult.push({ word: currentWord, chars: null, isNumber: true }); continue; }
        if (!dictionary.has(currentWord) && !fixedWordRules.has(currentWord) && !customWordRules.has(currentWord)) { finalResult.push({ word: currentWord, chars: null }); continue; }
        
        let pinyinsStr;
        if (customWordRules.has(currentWord)) { pinyinsStr = customWordRules.get(currentWord); }
        else if (fixedWordRules.has(currentWord)) { pinyinsStr = fixedWordRules.get(currentWord); } 
        else if (currentWord === '得' && subjectList.has(segments[i - 1])) { pinyinsStr = 'dei3'; } 
        else if (currentWord === '还' && nounList.has(segments[i + 1])) { pinyinsStr = 'huan2'; } 
        else if (currentWord === '了' && verbList.has(segments[i - 1])) { pinyinsStr = 'le5'; } 
        else if (currentWord === '得' && verbList.has(segments[i - 1])) { pinyinsStr = 'de5'; } 
        else if (currentWord === '着' && verbList.has(segments[i - 1])) { pinyinsStr = 'zhe5'; }
        else if (charDefaultRules.has(currentWord)) { pinyinsStr = charDefaultRules.get(currentWord); }
        else { 
            const dictEntry = dictionary.get(currentWord);
            if (dictEntry) {
                pinyinsStr = dictEntry[0].pinyin;
            }
        }
        
        const pinyins = pinyinsStr ? pinyinsStr.split(' ') : [];
        const chars = [];
        for (let k = 0; k < currentWord.length; k++) {
            const char = currentWord[k];
            const pinyinWithNum = pinyins[k] || '';
            const tone = pinyinWithNum.match(/(\d)/)?.[1] || '5';
            chars.push({ char: char, pinyin: convertPinyin(pinyinWithNum), tone: parseInt(tone) });
        }
        
        // 辞書の定義を取得
        const definitions = dictionary.get(currentWord)?.map(d => d.definition).join('; ');
        finalResult.push({ word: currentWord, chars: chars, definition: definitions });
    }
    return finalResult;
}

async function loadPrompts() {
    try {
        const response = await fetch('プロンプト.txt');
        if (!response.ok) throw new Error(`プロンプトファイルが見つかりません`);
        const promptFileContent = await response.text();
        const cnToJpMatch = promptFileContent.match(/<中国語を日本語に翻訳プロンプト>([\s\S]*?)<\/中国語を日本語に翻訳プロンプト>/);
        if (cnToJpMatch && cnToJpMatch[1]) cnToJpPrompt = cnToJpMatch[1].trim();
        const jpToCnMatch = promptFileContent.match(/<日本語を中国語に翻訳プロンプト>([\s\S]*?)<\/日本語を中国語に翻訳プロンプト>/);
        if (jpToCnMatch && jpToCnMatch[1]) jpToCnPrompt = jpToCnMatch[1].trim();
        if (!cnToJpPrompt || !jpToCnPrompt) throw new Error('プロンプト.txt からプロンプトを正常に読み込めませんでした。');
        console.log('プロンプトファイルを正常に読み込みました。');
    } catch (error) {
        console.error('プロンプトファイルの読み込みに失敗しました:', error);
        alert(`致命的なエラー: プロンプトファイルの読み込みに失敗しました。\n\n${error.message}`);
    }
}

function saveKeys() {
    const geminiKey = document.getElementById('gemini-api-key-input').value.trim();
    if (geminiKey) {
        localStorage.setItem('geminiApiKey', geminiKey);
        geminiApiKey = geminiKey;
    }
    alert('Gemini APIキーを保存しました。');
}

function loadKeys() {
    const geminiKey = localStorage.getItem('geminiApiKey');
    if (geminiKey) {
        document.getElementById('gemini-api-key-input').value = geminiKey;
        geminiApiKey = geminiKey;
    }
    initializePolly();
}

function initializePolly() {
    const region = 'ap-northeast-1';
    const identityPoolId = 'ap-northeast-1:51014915-a5b3-4fb4-abc6-4b725fcce752';

    speakBtn.disabled = true;

    AWS.config.region = region;
    AWS.config.credentials = new AWS.CognitoIdentityCredentials({
        IdentityPoolId: identityPoolId
    });

    AWS.config.credentials.get(function(err) {
        if (err) {
            console.error("Error retrieving credentials: ", err);
            alert("AWS認証情報の取得に失敗しました。");
            return;
        }
        polly = new AWS.Polly({ region: region });
        console.log('Polly client initialized with Cognito.');
        speakBtn.disabled = false;
        if (!audioContext) {
            try {
                audioContext = new (window.AudioContext || window.webkitAudioContext)();
                console.log('AudioContext initialized.');
            } catch (e) {
                console.error('Web Audio API is not supported in this browser.', e);
                alert('お使いのブラウザはWeb Audio APIをサポートしていません。');
            }
        }
    });
}

function updateSpeakButtonState(speaking) {
    if (speaking) {
        speakBtn.innerHTML = '■';
        speakBtn.title = '音声中止';
    } else {
        speakBtn.innerHTML = '🔊';
        speakBtn.title = '音声生成';
    }
}

async function speak(text, force_regenerate = false) {
    if (!polly || !audioContext || speakBtn.disabled) {
        alert('音声機能が初期化されていないか、準備中です。少し待ってからもう一度お試しください。');
        return;
    }
    if (!text || !text.trim()) return;

    if (audioContext.state === 'suspended') {
        await audioContext.resume();
    }

    stopSpeech();
    isSpeaking = true;
    updateSpeakButtonState(true);

    // 英語が含まれる場合でも、常にチャンクに分割して処理するようにロジックを統一
    let processedText = text
        .replace(/\b(w|W|ｗ|Ｗ)+\b/g, ' __LAUGH_PAUSE__ ')
        .replace(/哈{2,}/g, ' __LAUGH_PAUSE__ ');

    // 英語の単語もポーズとして機能するように、スペースで区切られたチャンクに分割する
    const chunks = processedText.split(/([a-zA-Z\.\s]+|[。、？！~～「」『』\n()（）]|__LAUGH_PAUSE__)/).filter(c => c && c.trim() !== '');
    speechQueue = chunks;
    playNextChunk();
}

async function playAudioFromText(text, onEndedCallback) {
    if (audioCache.has(text)) {
        const audioBuffer = audioCache.get(text);
        playAudioBuffer(audioBuffer, onEndedCallback);
        return;
    }

    try {
        const params = { Text: text, OutputFormat: 'mp3', VoiceId: 'Zhiyu', Engine: 'neural' };
        const data = await polly.synthesizeSpeech(params).promise();
        if (data.AudioStream) {
            const arrayBuffer = data.AudioStream.buffer.slice(data.AudioStream.byteOffset, data.AudioStream.byteOffset + data.AudioStream.byteLength);
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            audioCache.set(text, audioBuffer);
            playAudioBuffer(audioBuffer, onEndedCallback);
        } else {
            if (typeof onEndedCallback === 'function') onEndedCallback();
        }
    } catch (err) {
        console.error('Polly or Audio Decode Error:', err);
        if (typeof onEndedCallback === 'function') onEndedCallback();
    }
}

function playAudioBuffer(audioBuffer, onEndedCallback) {
    if (currentAudioSource) {
        currentAudioSource.stop();
    }
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    const gainNode = audioContext.createGain();
    gainNode.gain.value = 2.0; 
    source.connect(gainNode);
    gainNode.connect(audioContext.destination);
    source.start(0);
    currentAudioSource = source;
    source.onended = () => {
        currentAudioSource = null;
        if (typeof onEndedCallback === 'function') {
            onEndedCallback();
        }
    };
}

async function playNextChunk() {
    if (!isSpeaking || speechQueue.length === 0) {
        isSpeaking = false;
        updateSpeakButtonState(false);
        return;
    }

    const chunk = speechQueue.shift().trim();
    if (chunk === '') {
        playNextChunk();
        return;
    }

    const punctuationPauseMap = { '。': 500, '！': 500, '？': 500, '、': 250, '~': 200, '～': 200, '「': 150, '」': 150, '『': 150, '』': 150, '\n': 400, '(': 150, ')': 150, '（': 150, '）': 150 };
    if (punctuationPauseMap[chunk]) {
        speechTimer = setTimeout(playNextChunk, punctuationPauseMap[chunk]);
        return;
    }
    if (chunk === '__LAUGH_PAUSE__') {
        speechTimer = setTimeout(playNextChunk, 200);
        return;
    }
    if (/^\s+$/.test(chunk)) {
        speechTimer = setTimeout(playNextChunk, 150);
        return;
    }

    playAudioFromText(chunk, () => {
        if (isSpeaking) {
            playNextChunk();
        }
    });
}

function stopSpeech() {
    isSpeaking = false;
    updateSpeakButtonState(false);
    speechQueue = [];
    if (currentAudioSource) {
        currentAudioSource.onended = null;
        currentAudioSource.stop();
        currentAudioSource = null;
    }
    if (speechTimer) {
        clearTimeout(speechTimer);
        speechTimer = null;
    }
}

async function callGemini(prompt, mode) {
    if (!geminiApiKey) {
        alert('APIキーが設定されていません。');
        return null;
    }
    setLoadingState(true);
    abortController = new AbortController();
    const signal = abortController.signal;
    const model = "gemini-2.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`;
    try {
        const generationConfig = { temperature: 0.7, maxOutputTokens: 8192, thinkingConfig: { thinkingBudget: 0 } };
        const safetySettings = [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
        ];
        const systemInstruction = { parts: [{ text: (mode === 'jp-to-cn') ? jpToCnPrompt : cnToJpPrompt }] };
        const normalizedHistory = [];
        let lastRole = 'model';
        for (const message of chatHistory) { if (message.role !== lastRole) { normalizedHistory.push(message); lastRole = message.role; } }
        const contents = [...normalizedHistory, { role: "user", parts: [{ text: prompt }] }];
        const requestBody = { contents, systemInstruction, generationConfig, safetySettings };
        lastRequestLog = JSON.stringify({ model, mode, request_body: requestBody }, null, 2);
        console.log("--- Gemini API Request ---", lastRequestLog);
        const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody), signal });
        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`APIリクエスト失敗 (Status: ${response.status}) ${errorBody}`);
        }
        const data = await response.json();
        const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
        if (responseText) {
            chatHistory.push({ role: "user", parts: [{ text: prompt }] });
            chatHistory.push({ role: "model", parts: data.candidates[0].content.parts });
        }
        return responseText;
    } catch (error) {
        if (error.name === 'AbortError') {
            console.log('Fetch aborted by user.');
            geminiOutput.textContent = '翻訳を中止しました。';
        } else {
            console.error('Gemini API Error:', error);
            geminiOutput.textContent = `エラー: ${error.message}`;
        }
        return null;
    } finally {
        setLoadingState(false);
        abortController = null;
    }
}

function showDictionaryPopup(definition, event) {
    if (!dictionaryPopup || !definition) return;

    // event.target からクリックされた要素を取得
    const targetElement = event.currentTarget; 
    const rect = targetElement.getBoundingClientRect();

    dictionaryPopup.innerHTML = definition.replace(/\//g, '<br>');
    dictionaryPopup.classList.remove('hidden'); // 先に表示してサイズを取得

    const popupWidth = dictionaryPopup.offsetWidth;
    const popupHeight = dictionaryPopup.offsetHeight;
    const margin = 5; // 単語からのマージン

    let top, left;

    // 縦位置の決定：基本は単語の下、スペースがなければ上
    if (rect.bottom + popupHeight + margin < window.innerHeight) {
        // 下に十分なスペースがある場合
        top = rect.bottom + margin;
    } else {
        // 上に表示
        top = rect.top - popupHeight - margin;
    }

    // 横位置の決定：基本は単語の左端に合わせる
    left = rect.left;

    // 右端がはみ出す場合は調整
    if (left + popupWidth > window.innerWidth) {
        left = window.innerWidth - popupWidth - margin;
    }
    // 左端がはみ出す場合は調整 (ほぼないが念のため)
    if (left < 0) {
        left = margin;
    }
    
    // ページ全体のスクロール量を加味
    dictionaryPopup.style.top = `${top + window.scrollY}px`;
    dictionaryPopup.style.left = `${left + window.scrollX}px`;

    overlay.classList.remove('hidden');
    isPopupVisible = true;
}

function hideDictionaryPopup() {
    if (dictionaryPopup && isPopupVisible) {
        // ポップアップとオーバーレイを両方隠す
        dictionaryPopup.classList.add('hidden');
        overlay.classList.add('hidden');
        isPopupVisible = false;
    }
}

function updatePinyinDisplay(text) {
    const words = processText(text);
    chineseOutput.innerHTML = '';
    const fragment = document.createDocumentFragment();
    words.forEach(item => {
        if (item.isEnglish) {
            const englishDiv = document.createElement('div');
            englishDiv.className = 'word-group english-word';
            englishDiv.textContent = item.word;
            englishDiv.addEventListener('click', () => speak(item.word));
            englishDiv.style.cursor = 'pointer';
            fragment.appendChild(englishDiv);
            fragment.appendChild(document.createTextNode(' '));
            return;
        }
        if (item.isPunctuation || item.isNumber || !item.chars) {
            const puncDiv = document.createElement('div');
            puncDiv.className = 'punctuation';
            puncDiv.textContent = item.word;
            fragment.appendChild(puncDiv);
            if (!item.isPunctuation) {
                 fragment.appendChild(document.createTextNode(' '));
            }
            return;
        }
        const wordGroupDiv = document.createElement('div');
        wordGroupDiv.className = 'word-group';
        wordGroupDiv.addEventListener('click', (event) => {
            speak(item.word);
            if (item.definition) {
                showDictionaryPopup(item.definition, event);
            }
        });
        wordGroupDiv.style.cursor = 'pointer';
        item.chars.forEach(charInfo => {
            const charItemSpan = document.createElement('span');
            charItemSpan.className = 'char-item';
            const pinyinSpan = document.createElement('span');
            pinyinSpan.className = `pinyin tone-${charInfo.tone}`;
            pinyinSpan.textContent = charInfo.pinyin;
            const hanziSpan = document.createElement('span');
            hanziSpan.className = `hanzi tone-${charInfo.tone}`;
            hanziSpan.textContent = charInfo.char;
            charItemSpan.appendChild(pinyinSpan);
            charItemSpan.appendChild(hanziSpan);
            wordGroupDiv.appendChild(charItemSpan);
        });
        fragment.appendChild(wordGroupDiv);
        fragment.appendChild(document.createTextNode(' '));
    });
    chineseOutput.appendChild(fragment);
}

function setLoadingState(isLoading) {
    if (isLoading) {
        translateBtn.innerHTML = '🛑';
        translateBtn.title = '中止';
        speakBtn.disabled = true;
        clearInputBtn.disabled = true;
        clearBtn.disabled = true;
    } else {
        translateBtn.innerHTML = '▶️';
        translateBtn.title = '翻訳';
        speakBtn.disabled = false;
        clearInputBtn.disabled = false;
        clearBtn.disabled = false;
    }
}

function autoResizeTextarea() {
    textInput.style.height = 'auto';
    let newHeight = textInput.scrollHeight;
    const maxHeight = 6 * 1.5 * 16;
    if (newHeight > maxHeight) {
        newHeight = maxHeight;
    }
    textInput.style.height = `${newHeight}px`;
}

async function handleTranslation() {
    const originalText = textInput.value.trim();
    if (!originalText) return;

    // 1. モード判定
    const translateMatch = originalText.match(/Text to translate:\s*([\s\S]*)/i);
    let mode = 'cn-to-jp'; // デフォルト
    // "Text to translate:" の後に日本語があるかを優先的にチェック
    if (translateMatch && /[\u3040-\u309F\u30A0-\u30FF]/.test(translateMatch[1])) {
        mode = 'jp-to-cn';
    } else if (!translateMatch) {
        // テンプレートがない場合は、従来通り末尾で判定
        const lastChars = originalText.slice(-5);
        if (/[\u3040-\u309F\u30A0-\u30FF]/.test(lastChars)) {
            mode = 'jp-to-cn';
        }
    }

    // 2. 翻訳対象テキストの抽出とAPI用プロンプトの作成
    let textForUI = originalText; // UI表示用のテキスト
    let promptForApi = originalText; // API送信用テキスト

    if (mode === 'jp-to-cn') {
        if (translateMatch && translateMatch[1].trim()) {
            textForUI = translateMatch[1].trim();
        }
        const contextMatch = originalText.match(/^Context:\s*([\s\S]*?)(?:Text to translate:|$)/i);
        const contextText = (contextMatch && contextMatch[1]) ? contextMatch[1].trim() : null;
        if (contextText) {
             promptForApi = `Context: ${contextText}\n\nText to translate: ${textForUI}`;
        } else {
            promptForApi = textForUI;
        }

    } else { // cn-to-jp
        const contextMatch = originalText.match(/^Context:\s*([\s\S]*?)(?:Text to translate:|$)/i);
        if (contextMatch && contextMatch[1].trim()) {
            textForUI = contextMatch[1].trim();
            promptForApi = textForUI;
        }
    }

    // 3. 翻訳実行
    chineseOutput.innerHTML = '';
    geminiOutput.innerHTML = '';

    if (mode === 'cn-to-jp') {
        lastSpokenText = textForUI;
        updatePinyinDisplay(textForUI);
        const translation = await callGemini(promptForApi, 'cn-to-jp');
        if (translation) {
            const highlightedTranslation = translation.replace(/\*\*(.*?)\*\*/g, '<span class="important-expression">$1</span>').replace(/`/g, '').replace(/\n/g, '<br>');
            geminiOutput.innerHTML = highlightedTranslation;
        }
    } else { // jp-to-cn
        const response = await callGemini(promptForApi, 'jp-to-cn');
        if (!response) return;
        const translationPairs = [];
        const blocks = response.split(/(【中国語翻訳\d】:)/).slice(1);
        for (let i = 0; i < blocks.length; i += 2) {
            const content = blocks[i+1];
            const codeMatch = content.match(/```(html)?\r?\n([\s\S]+?)\r?\n```/);
            if (codeMatch && codeMatch[2]) {
                const chineseText = codeMatch[2].trim();
                const explanationRaw = content.substring(codeMatch[0].length).trim();
                const explanationHtml = explanationRaw.replace(/\*\*(.*?)\*\*/g, '<span class="important-expression">$1</span>').replace(/`/g, '').replace(/\n/g, '<br>');
                translationPairs.push({ chineseText, explanationText: explanationHtml });
            }
        }
        if (translationPairs.length === 0) {
            geminiOutput.innerHTML = response.replace(/`/g, '').replace(/\n/g, '<br>');
        } else {
            const firstTranslation = translationPairs[0].chineseText;
            updatePinyinDisplay(firstTranslation);
            speak(firstTranslation);
            lastSpokenText = firstTranslation;
            
            translationPairs.forEach(({ chineseText, explanationText }, index) => {
                const container = document.createElement('div');
                container.className = 'translation-block';
                const clickablePart = document.createElement('div');
                clickablePart.className = 'translation-option';
                if (index === 0) { clickablePart.classList.add('selected'); }
                clickablePart.innerHTML = `<code>${chineseText.replace(/\n/g, '<br>')}</code>`;
                const explanationPart = document.createElement('div');
                explanationPart.className = 'explanation';
                explanationPart.innerHTML = explanationText;
                
                clickablePart.addEventListener('click', () => {
                    document.querySelectorAll('.translation-option.selected').forEach(el => { el.classList.remove('selected'); });
                    clickablePart.classList.add('selected');
                    updatePinyinDisplay(chineseText);
                    if (navigator.clipboard) {
                        navigator.clipboard.writeText(chineseText)
                            .then(() => console.log('Copied to clipboard.'))
                            .catch(err => console.error('Copy failed:', err));
                    } else {
                        console.warn('Clipboard API not available in this context.');
                    }
                    speak(chineseText);
                    textInput.scrollIntoView({ behavior: 'instant', block: 'start' }); // 入力欄の上部へスクロール
                    lastSpokenText = chineseText;
                });

                container.appendChild(clickablePart);
                if (explanationText) { container.appendChild(explanationPart); }
                geminiOutput.appendChild(container);
            });
        }
    }
}

function handleAutoPinyin() {
    clearTimeout(inputDebounceTimer);
    inputDebounceTimer = setTimeout(() => {
        const fullText = textInput.value;
        const contextMatch = fullText.match(/^Context:\s*([\s\S]*?)(?:Text to translate:|$)/i);
        const contextText = (contextMatch && contextMatch[1]) ? contextMatch[1].trim() : null;

        // Contextがあり、中国語が含まれている場合のみ処理
        if (contextText && /[\u4e00-\u9fa5]/.test(contextText)) {
            // ピンイン表示は常に行う
            updatePinyinDisplay(contextText);
            lastSpokenText = contextText; // 手動再生用に常に更新

            // 自動再生はContext内容が変わったときの一度だけ
            if (contextText !== lastAutoSpokenContext) {
                speak(contextText);
                lastAutoSpokenContext = contextText;
            }
        } else if (!contextMatch) {
            // テンプレートが全く使われていない場合（従来の中国語のみ入力のケース）
            const text = fullText.trim();
            const containsChinese = /[\u4e00-\u9fa5]/.test(text);
            const containsJapanese = /[\u3040-\u309F\u30A0-\u30FF]/.test(text.slice(-10));
             if (containsChinese && !containsJapanese) {
                updatePinyinDisplay(text);
                speak(text);
                lastSpokenText = text;
            }
        }
    }, 500);
}

document.addEventListener('DOMContentLoaded', () => {
    loadKeys();
    loadPrompts();
    loadDictionaries();

    textInput.addEventListener('input', () => {
        autoResizeTextarea();
        handleAutoPinyin();
    });

    settingsBtn.addEventListener('click', () => apiKeySection.classList.toggle('hidden'));
    saveKeysBtn.addEventListener('click', saveKeys);

    copyLogBtn.addEventListener('click', () => {
        if (lastRequestLog) {
            navigator.clipboard.writeText(lastRequestLog)
                .then(() => alert('最新のログをクリップボードにコピーしました。'))
                .catch(err => console.error('クリップボードへのコピーに失敗しました:', err));
        } else {
            alert('コピーするログがありません。');
        }
    });
    
    speakBtn.addEventListener('click', () => {
        if (isSpeaking) {
            stopSpeech();
        } else {
            const fullText = textInput.value;
            const contextMatch = fullText.match(/^Context:\s*([\s\S]*?)(?:Text to translate:|$)/i);
            let textToSpeak = lastSpokenText; // デフォルトは最後に処理されたテキスト

            // Contextがある場合は、それを優先して手動再生の対象にする
            if (contextMatch && contextMatch[1] && contextMatch[1].trim()) {
                textToSpeak = contextMatch[1].trim();
            }
            
            if (textToSpeak) {
                speak(textToSpeak, true); // trueで強制再生成
            }
        }
    });

    translateBtn.addEventListener('click', () => {
        if (translateBtn.innerHTML === '🛑') {
            if (abortController) {
                abortController.abort();
            }
        } else {
            handleTranslation();
        }
    });

    clearInputBtn.addEventListener('click', () => {
        textInput.value = '';
        autoResizeTextarea();
    });

    clearBtn.addEventListener('click', () => {
        // textInput.value = ''; // この行を削除
        chineseOutput.innerHTML = '';
        geminiOutput.innerHTML = '';
        chatHistory = [];
        // autoResizeTextarea(); // テキストボックスのサイズ変更も不要
    });

    pasteBtn.addEventListener('click', async () => {
        try {
            const text = await navigator.clipboard.readText();
            textInput.value = text;
            autoResizeTextarea();
            handleAutoPinyin();
        } catch (err) {
            console.error('クリップボードの読み取りに失敗しました:', err);
            alert('クリップボードからの貼り付けに失敗しました。');
        }
    });

    // ポップアップとオーバーレイの初期化
    dictionaryPopup = document.getElementById('dictionary-popup');
    overlay = document.getElementById('overlay');

    // オーバーレイがクリックされたらポップアップを隠す
    overlay.addEventListener('click', () => {
        hideDictionaryPopup();
    });
});
