// Знаходимо всі елементи
const processButton = document.getElementById('processButton');
const audioFileInput = document.getElementById('audioFile');
const durationInput = document.getElementById('durationInput');
const resultsDiv = document.getElementById('results');
const spinner = processButton.querySelector('.spinner-border');
const progressContainer = document.getElementById('progressContainer');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');

// Елементи для FFmpeg
const fallbackContainer = document.getElementById('fallbackContainer');
const fallbackButton = document.getElementById('fallbackButton');
const fallbackSpinner = fallbackButton.querySelector('.spinner-border');
const ffmpegProgress = document.getElementById('ffmpegProgress');
const ffmpegProgressBar = document.getElementById('ffmpegProgressBar');
const ffmpegLog = document.getElementById('ffmpegLog');

const audioContext = new (window.AudioContext || window.webkitAudioContext)();
const { FFmpeg } = FFmpegWASM; // Деструктуризуємо для зручності
let ffmpeg; // Ініціалізуємо пізніше

/**
 * ФУНКЦІЯ НАРІЗКИ (винесена окремо для повторного використання)
 * Приймає готовий AudioBuffer та нарізає його на частини.
 */
async function splitAudioBuffer(audioBuffer, chunkDurationInSeconds) {
    // Показуємо індикатор прогресу нарізки
    progressContainer.style.display = 'block';
    
    const totalDuration = audioBuffer.duration;
    const sampleRate = audioBuffer.sampleRate;
    const numberOfChannels = audioBuffer.numberOfChannels;
    const totalChunks = Math.ceil(totalDuration / chunkDurationInSeconds);

    let startTime = 0;
    for (let chunkIndex = 1; chunkIndex <= totalChunks; chunkIndex++) {
        const progressPercentage = Math.round(((chunkIndex - 1) / totalChunks) * 100);
        progressBar.style.width = `${progressPercentage}%`;
        progressText.textContent = `Нарізаю частину ${chunkIndex} з ${totalChunks}...`;
        await new Promise(resolve => setTimeout(resolve, 10));

        const endTime = Math.min(startTime + chunkDurationInSeconds, totalDuration);
        const segmentDuration = endTime - startTime;

        const chunkBuffer = audioContext.createBuffer(
            numberOfChannels,
            Math.ceil(segmentDuration * sampleRate),
            sampleRate
        );

        for (let i = 0; i < numberOfChannels; i++) {
            chunkBuffer.getChannelData(i).set(audioBuffer.getChannelData(i).subarray(
                Math.floor(startTime * sampleRate),
                Math.floor(endTime * sampleRate)
            ));
        }

        const wavData = bufferToWav(chunkBuffer);
        const blob = new Blob([wavData], { type: 'audio/wav' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = `part_${chunkIndex}.wav`;
        link.className = 'btn btn-success me-2 mb-2';
        link.textContent = `Завантажити частину ${chunkIndex}`;
        resultsDiv.appendChild(link);

        startTime += chunkDurationInSeconds;
    }

    progressText.textContent = 'Готово!';
    progressBar.style.width = '100%';
    progressBar.classList.remove('progress-bar-animated');
}


// --- ОСНОВНА ЛОГІКА ---
processButton.addEventListener('click', async () => {
    const file = audioFileInput.files[0];
    if (!file) return alert('Будь ласка, оберіть файл!');

    const chunkDurationInMinutes = parseInt(durationInput.value, 10);
    if (!chunkDurationInMinutes || chunkDurationInMinutes <= 0) return alert('Введіть коректну тривалість.');

    // Скидання інтерфейсу
    spinner.style.display = 'inline-block';
    processButton.disabled = true;
    resultsDiv.innerHTML = '';
    progressContainer.style.display = 'none';
    fallbackContainer.style.display = 'none';
    ffmpegProgress.style.display = 'none';

    try {
        const arrayBuffer = await file.arrayBuffer();
        // 1. Спроба швидкого нативного декодування
        const originalAudioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        // Якщо успішно, одразу нарізаємо
        await splitAudioBuffer(originalAudioBuffer, chunkDurationInMinutes * 60);
    } catch (error) {
        // 2. Якщо нативне декодування не вдалося
        if (error.name === 'DOMException') {
            // Показуємо опцію конвертації
            fallbackContainer.style.display = 'block';
        } else {
            resultsDiv.innerHTML = `<div class="alert alert-danger">Виникла невідома помилка: ${error.message}</div>`;
        }
    } finally {
        spinner.style.display = 'none';
        processButton.disabled = false;
    }
});


// --- ЛОГІКА ДЛЯ КНОПКИ ГЛИБОКОЇ КОНВЕРТАЦІЇ ---
fallbackButton.addEventListener('click', async () => {
    const file = audioFileInput.files[0];
    const chunkDurationInMinutes = parseInt(durationInput.value, 10);

    fallbackSpinner.style.display = 'inline-block';
    fallbackButton.disabled = true;
    ffmpegProgress.style.display = 'block';

    try {
        ffmpegLog.textContent = 'Завантаження модуля FFmpeg (близько 30 МБ)...';
        if (!ffmpeg) {
           ffmpeg = new FFmpeg();
           ffmpeg.on('log', ({ message }) => {
              // Показуємо логи для цікавих
              console.log(message);
           });
           ffmpeg.on('progress', ({ progress, time }) => {
              const p = Math.round(progress * 100);
              ffmpegProgressBar.style.width = `${p}%`;
              ffmpegProgressBar.textContent = `${p}%`;
           });
           await ffmpeg.load();
        }

        ffmpegLog.textContent = 'Конвертація файлу у WAV... Це може зайняти час.';
        ffmpegProgressBar.style.width = `0%`;
        ffmpegProgressBar.textContent = `0%`;

        const inputFileName = 'input' + file.name.slice(file.name.lastIndexOf('.'));
        const outputFileName = 'output.wav';

        await ffmpeg.writeFile(inputFileName, new Uint8Array(await file.arrayBuffer()));
        await ffmpeg.exec(['-i', inputFileName, '-acodec', 'pcm_s16le', '-ar', '44100', outputFileName]);
        const data = await ffmpeg.readFile(outputFileName);

        ffmpegLog.textContent = 'Конвертація завершена. Розкодовую результат...';

        // Розкодовуємо сконвертований WAV-файл
        const audioBuffer = await audioContext.decodeAudioData(data.buffer);
        
        // Ховаємо блок FFmpeg та запускаємо нарізку
        fallbackContainer.style.display = 'none';
        ffmpegProgress.style.display = 'none';
        await splitAudioBuffer(audioBuffer, chunkDurationInMinutes * 60);

    } catch(err) {
        resultsDiv.innerHTML = `<div class="alert alert-danger">Помилка під час конвертації: ${err.message}</div>`;
    } finally {
        fallbackSpinner.style.display = 'none';
        fallbackButton.disabled = false;
    }
});


// Функція для конвертації в WAV (без змін, але все ще потрібна)
function bufferToWav(aBuffer) {
    const numOfChan = aBuffer.numberOfChannels;
    const length = aBuffer.length * numOfChan * 2 + 44;
    const buffer = new ArrayBuffer(length);
    const view = new DataView(buffer);
    const channels = [];
    let i, sample, offset = 0, pos = 0;
    setUint32(0x46464952); setUint32(length - 8); setUint32(0x45564157);
    setUint32(0x20746d66); setUint32(16); setUint16(1); setUint16(numOfChan);
    setUint32(aBuffer.sampleRate); setUint32(aBuffer.sampleRate * 2 * numOfChan);
    setUint16(numOfChan * 2); setUint16(16); setUint32(0x61746164);
    setUint32(length - pos - 4);
    for (i = 0; i < aBuffer.numberOfChannels; i++) channels.push(aBuffer.getChannelData(i));
    while (pos < length) {
        for (i = 0; i < numOfChan; i++) {
            sample = Math.max(-1, Math.min(1, channels[i][offset]));
            sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
            view.setInt16(pos, sample, true); pos += 2;
        }
        offset++;
    }
    return buffer;
    function setUint16(data) { view.setUint16(pos, data, true); pos += 2; }
    function setUint32(data) { view.setUint32(pos, data, true); pos += 4; }
}