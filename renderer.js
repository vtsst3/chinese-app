// --- DOM要素の取得 ---
const apiKeyInput = document.getElementById('gemini-api-key-input');
const awsAccessKeyIdInput = document.getElementById('aws-access-key-id-input');
const awsSecretKeyInput = document.getElementById('aws-secret-key-input');
const awsRegionInput = document.getElementById('aws-region-input');
const saveKeysBtn = document.getElementById('save-keys-btn');
const copyLogBtn = document.getElementById('copy-log-btn');
const textInput = document.getElementById('text-input');
const chineseOutput = document.getElementById('chinese-output');
const geminiOutput = document.getElementById('gemini-output');
const translateBtn = document.getElementById('translate-btn');
const cancelBtn = document.getElementById('cancel-btn');
const clearBtn = document.getElementById('clear-btn');
const speakBtn = document.getElementById('speak-btn');
const stopBtn = document.getElementById('stop-btn');
const toggleApiKeyBtn = document.getElementById('toggle-api-key-btn');
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
let inputDebounceTimer;
let abortController = null; // AbortControllerを保持する変数
let speechQueue = [];
let isSpeaking = false;
let speechTimer = null; // ポーズ用のタイマーID

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

        // 優先度1: 英単語を抽出
        const englishMatch = remainingText.match(/^[a-zA-Z]+/);
        if (englishMatch) {
            foundWord = englishMatch[0];
        } else {
            // 優先度2: 句読点
            const puncMatch = remainingText.match(/^[^\u4e00-\u9fa5a-zA-Z0-9]+/);
            if (puncMatch) {
                foundWord = puncMatch[0];
            } else {
                // 優先度3: 数字
                const numMatch = remainingText.match(/^[0-9:.]+/);
                if (numMatch) {
                    foundWord = numMatch[0];
                } else {
                    // 優先度4: 中国語の辞書検索
                    for (const ruleWord of Array.from(customWordRules.keys()).sort((a,b) => b.length - a.length)) { if (remainingText.startsWith(ruleWord)) { foundWord = ruleWord; break; } }
                    if (!foundWord) { for (const ruleWord of Array.from(fixedWordRules.keys()).sort((a,b) => b.length - a.length)) { if (remainingText.startsWith(ruleWord)) { foundWord = ruleWord; break; } } }
                    if (!foundWord) { for (let j = Math.min(10, remainingText.length); j > 0; j--) { const sub = remainingText.substring(0, j); if (dictionary.has(sub)) { foundWord = sub; break; } } }
                }
            }
        }
        // マッチしなかった場合は1文字進める
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

        if (isEnglish) {
            finalResult.push({ word: currentWord, chars: null, isEnglish: true });
            continue;
        }
        if (isPunctuation) {
            finalResult.push({ word: currentWord, chars: null, isPunctuation: true });
            continue;
        }
        if (isNumber) {
            finalResult.push({ word: currentWord, chars: null, isNumber: true });
            continue;
        }
        // 中国語またはその他の文字
        if (!dictionary.has(currentWord) && !fixedWordRules.has(currentWord) && !customWordRules.has(currentWord)) {
            finalResult.push({ word: currentWord, chars: null }); // 辞書にない場合はピンインなし
            continue;
        }
        
        let pinyinsStr;
        if (customWordRules.has(currentWord)) { pinyinsStr = customWordRules.get(currentWord); }
        else if (fixedWordRules.has(currentWord)) { pinyinsStr = fixedWordRules.get(currentWord); } 
        else if (currentWord === '得' && subjectList.has(segments[i - 1])) { pinyinsStr = 'dei3'; } 
        else if (currentWord === '还' && nounList.has(segments[i + 1])) { pinyinsStr = 'huan2'; } 
        else if (currentWord === '了' && verbList.has(segments[i - 1])) { pinyinsStr = 'le5'; } 
        else if (currentWord === '得' && verbList.has(segments[i - 1])) { pinyinsStr = 'de5'; } 
        else if (currentWord === '着' && verbList.has(segments[i - 1])) { pinyinsStr = 'zhe5'; }
        else if (charDefaultRules.has(currentWord)) { pinyinsStr = charDefaultRules.get(currentWord); }
        else { pinyinsStr = dictionary.get(currentWord)[0].pinyin; }
        
        const pinyins = pinyinsStr.split(' ');
        const chars = [];
        for (let k = 0; k < currentWord.length; k++) {
            const char = currentWord[k];
            const pinyinWithNum = pinyins[k] || '';
            const tone = pinyinWithNum.match(/(\d)/)?.[1] || '5';
            chars.push({ char: char, pinyin: convertPinyin(pinyinWithNum), tone: parseInt(tone) });
        }
        finalResult.push({ word: currentWord, chars: chars });
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
    const awsAccessKey = awsAccessKeyIdInput.value.trim();
    const awsSecretKey = awsSecretKeyInput.value.trim();
    const awsRegion = awsRegionInput.value.trim();

    if (geminiKey) localStorage.setItem('geminiApiKey', geminiKey);
    if (awsAccessKey) localStorage.setItem('awsAccessKeyId', awsAccessKey);
    if (awsSecretKey) localStorage.setItem('awsSecretAccessKey', awsSecretKey);
    if (awsRegion) localStorage.setItem('awsRegion', awsRegion);
    
    alert('キーを保存しました。');
    initializePolly();
}

function loadKeys() {
    const geminiKey = localStorage.getItem('geminiApiKey');
    const awsAccessKey = localStorage.getItem('awsAccessKeyId');
    const awsSecretKey = localStorage.getItem('awsSecretAccessKey');
    const awsRegion = localStorage.getItem('awsRegion');

    if (geminiKey) {
        document.getElementById('gemini-api-key-input').value = geminiKey;
        geminiApiKey = geminiKey;
    }
    if (awsAccessKey) awsAccessKeyIdInput.value = awsAccessKey;
    if (awsSecretKey) awsSecretKeyInput.value = awsSecretKey;
    if (awsRegion) awsRegionInput.value = awsRegion;

    initializePolly();
}

function initializePolly() {
    const accessKeyId = awsAccessKeyIdInput.value.trim();
    const secretAccessKey = awsSecretKeyInput.value.trim();
    const region = awsRegionInput.value.trim();

    if (accessKeyId && secretAccessKey && region) {
        AWS.config.update({
            accessKeyId: accessKeyId,
            secretAccessKey: secretAccessKey,
            region: region
        });
        polly = new AWS.Polly();
        // AudioContextの初期化 (ユーザーの操作後に作成するのが望ましい)
        if (!audioContext) {
            try {
                audioContext = new (window.AudioContext || window.webkitAudioContext)();
                console.log('AudioContext initialized.');
            } catch (e) {
                console.error('Web Audio API is not supported in this browser.', e);
                alert('お使いのブラウザはWeb Audio APIをサポートしていません。');
            }
        }
        console.log('Polly client initialized.');
    } else {
        console.log('Polly client not initialized. AWS credentials missing.');
    }
}

async function speak(text, force_regenerate = false) {
    if (!polly) {
        alert('AWS認証情報が設定されていないため、音声を再生できません。');
        return;
    }
    if (!text || !text.trim()) return;

    stopSpeech();
    isSpeaking = true;

    // 1. 前処理：笑い表現を特殊なポーズ記号に置換
    let processedText = text
        .replace(/\b(w|W|ｗ|Ｗ)+\b/g, ' __LAUGH_PAUSE__ ')
        .replace(/哈{2,}/g, ' __LAUGH_PAUSE__ ');

    // 2. チャンク分割：句読点、スペース、改行、特殊記号で分割
    const chunks = processedText.split(/([。、？！~～「」『』""\s\n]|__LAUGH_PAUSE__)/).filter(Boolean);

    speechQueue = chunks;
    playNextChunk();
}


async function playNextChunk() {
    if (!isSpeaking || speechQueue.length === 0) {
        isSpeaking = false;
        return;
    }

    // 1. 再生するテキストチャンクをキューから収集する
    let textToSpeak = '';
    let firstPauseChunk = null;

    while(speechQueue.length > 0) {
        const chunk = speechQueue[0]; // キューの先頭を覗き見る
        const isPauseSymbol = /^[。、？！~～「」『』""\s\n]$/.test(chunk) || chunk === '__LAUGH_PAUSE__';

        if (isPauseSymbol) {
            firstPauseChunk = chunk;
            break; // ポーズ記号が見つかったら収集を停止
        } else {
            textToSpeak += speechQueue.shift(); // テキストチャンクをキューから取り出して結合
        }
    }
    
    textToSpeak = textToSpeak.trim();

    // 2. 収集したテキストを再生する
    if (textToSpeak) {
        const onended = () => {
            // 再生が終わったら、ポーズ処理に進む
            handlePause(firstPauseChunk);
        };

        // Web Audio APIを使用するように変更
        const playAudio = (buffer) => {
            if (!isSpeaking) return;
            currentAudioSource = audioContext.createBufferSource();
            currentAudioSource.buffer = buffer;
            currentAudioSource.connect(audioContext.destination);
            currentAudioSource.onended = onended;
            currentAudioSource.start(0);
        };

        if (audioCache.has(textToSpeak)) {
            playAudio(audioCache.get(textToSpeak));
        } else {
            const params = { Text: textToSpeak, OutputFormat: 'mp3', VoiceId: 'Zhiyu', Engine: 'neural' };
            try {
                const data = await polly.synthesizeSpeech(params).promise();
                if (data.AudioStream) {
                    const arrayBuffer = new Uint8Array(data.AudioStream).buffer;
                    audioContext.decodeAudioData(arrayBuffer, (buffer) => {
                        audioCache.set(textToSpeak, buffer);
                        playAudio(buffer);
                    }, (err) => {
                        console.error('Error decoding audio data', err);
                        onended();
                    });
                } else {
                    onended();
                }
            } catch (err) {
                console.error('Polly Error:', err);
                onended();
            }
        }
    } else {
        // 3. 再生するテキストがなければ、直接ポーズ処理に進む
        handlePause(firstPauseChunk);
    }
}

function handlePause(pauseChunk) {
    if (!isSpeaking) return;

    if (pauseChunk) {
        speechQueue.shift(); // ポーズ記号をキューから取り除く

        const punctuationPauseMap = {
            '。': 500, '！': 500, '？': 500,
            '、': 250,
            '~': 200, '～': 200,
            '「': 150, '」': 150, '『': 150, '』': 150, '""': 150
        };
        
        let pauseDuration = 0;
        if (punctuationPauseMap[pauseChunk]) {
            pauseDuration = punctuationPauseMap[pauseChunk];
        } else if (pauseChunk === '__LAUGH_PAUSE__') {
            pauseDuration = 200;
        } else if (/\s/.test(pauseChunk)) { // 改行とスペースの両方を捉える
            pauseDuration = (pauseChunk.includes('\n')) ? 400 : 150;
        }


        if (pauseDuration > 0) {
            speechTimer = setTimeout(playNextChunk, pauseDuration);
        } else {
            playNextChunk(); // 不明なポーズ記号は待たずに次へ
        }
    } else {
        playNextChunk(); // ポーズ記号がなければすぐに次へ
    }
}

function stopSpeech() {
    isSpeaking = false;
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
    
    abortController = new AbortController(); // 新しいAbortControllerを生成
    const signal = abortController.signal;

    const model = "gemini-2.5-pro";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`;
    try {
        const generationConfig = { temperature: 0.7, maxOutputTokens: 8192, thinkingConfig: { thinkingBudget: 128 } };
        const safetySettings = [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
        ];
        const systemInstruction = { parts: [{ text: (mode === 'jp-to-cn') ? jpToCnPrompt : cnToJpPrompt }] };
        const normalizedHistory = [];
        let lastRole = 'model';
        for (const message of chatHistory) {
            if (message.role !== lastRole) {
                normalizedHistory.push(message);
                lastRole = message.role;
            }
        }
        const contents = [...normalizedHistory, { role: "user", parts: [{ text: prompt }] }];
        const requestBody = { contents, systemInstruction, generationConfig, safetySettings };
        lastRequestLog = JSON.stringify({ model, mode, request_body: requestBody }, null, 2);
        console.log("--- Gemini API Request ---");
        console.log(lastRequestLog);
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
        abortController = null; // AbortControllerをリセット
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
        wordGroupDiv.addEventListener('click', () => speak(item.word));
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
    translateBtn.disabled = isLoading;
    cancelBtn.disabled = !isLoading; // 中止ボタンはロード中にのみ有効
    clearBtn.disabled = isLoading;
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
    const text = textInput.value.trim();
    if (!text) return;
    const lastChars = text.slice(-5);
    const containsJapanese = /[\u3040-\u309F\u30A0-\u30FF]/.test(lastChars);
    const mode = containsJapanese ? 'jp-to-cn' : 'cn-to-jp';

    chineseOutput.innerHTML = '';
    geminiOutput.innerHTML = '';

    if (mode === 'cn-to-jp') {
        lastSpokenText = text;
        updatePinyinDisplay(text);
        const translation = await callGemini(text, 'cn-to-jp');
        if (translation) {
            const highlightedTranslation = translation.replace(/\*\*(.*?)\*\*/g, '<span class="important-expression">$1</span>')
                                                      .replace(/`/g, '')
                                                      .replace(/\n/g, '<br>');
            geminiOutput.innerHTML = highlightedTranslation;
        }
    } else { // jp-to-cn
        const response = await callGemini(text, 'jp-to-cn');
        if (!response) return;
        const translationPairs = [];
        const blocks = response.split(/(【中国語翻訳\d】:)/).slice(1);
        for (let i = 0; i < blocks.length; i += 2) {
            const content = blocks[i+1];
            const codeMatch = content.match(/```(html)?\r?\n([\s\S]+?)\r?\n```/);
            if (codeMatch && codeMatch[2]) {
                const chineseText = codeMatch[2].trim();
                const explanationRaw = content.substring(codeMatch[0].length).trim();
                const explanationHtml = explanationRaw.replace(/\*\*(.*?)\*\*/g, '<span class="important-expression">$1</span>')
                                                      .replace(/`/g, '')
                                                      .replace(/\n/g, '<br>');
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
                if (index === 0) {
                    clickablePart.classList.add('selected');
                }
                clickablePart.innerHTML = `<code>${chineseText.replace(/\n/g, '<br>')}</code>`;
                const explanationPart = document.createElement('div');
                explanationPart.className = 'explanation';
                explanationPart.innerHTML = explanationText;
                clickablePart.addEventListener('click', () => {
                    document.querySelectorAll('.translation-option.selected').forEach(el => {
                        el.classList.remove('selected');
                    });
                    clickablePart.classList.add('selected');
                    updatePinyinDisplay(chineseText);
                    navigator.clipboard.writeText(chineseText).catch(err => console.error('コピー失敗:', err));
                    speak(chineseText);
                    lastSpokenText = chineseText;
                });
                container.appendChild(clickablePart);
                if (explanationText) {
                    container.appendChild(explanationPart);
                }
                geminiOutput.appendChild(container);
            });
        }
    }
}

function handleAutoPinyin() {
    clearTimeout(inputDebounceTimer);
    inputDebounceTimer = setTimeout(() => {
        const text = textInput.value.trim();
        if (!text) return;

        const containsChinese = /[\u4e00-\u9fa5]/.test(text);
        const lastChars = text.slice(-5);
        const containsJapanese = /[\u3040-\u309F\u30A0-\u30FF]/.test(lastChars);

        if (containsChinese && !containsJapanese) {
            updatePinyinDisplay(text);
            speak(text);
            lastSpokenText = text;
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

    toggleApiKeyBtn.addEventListener('click', () => apiKeySection.classList.toggle('hidden'));
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
    
    stopBtn.addEventListener('click', stopSpeech);

    speakBtn.addEventListener('click', () => {
        if(lastSpokenText) {
            speak(lastSpokenText, true);
        }
    });

    translateBtn.addEventListener('click', handleTranslation);

    cancelBtn.addEventListener('click', () => {
        if (abortController) {
            abortController.abort();
        }
    });

    clearBtn.addEventListener('click', () => {
        textInput.value = '';
        chineseOutput.innerHTML = '';
        geminiOutput.innerHTML = '';
        chatHistory = [];
        autoResizeTextarea();
    });
});
