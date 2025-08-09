// Знаходимо елементи на сторінці
const processButton = document.getElementById('processButton');
const audioFileInput = document.getElementById('audioFile');
const resultsDiv = document.getElementById('results');
const spinner = processButton.querySelector('.spinner-border');
const progressContainer = document.getElementById('progressContainer');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');

const audioContext = new (window.AudioContext || window.webkitAudioContext)();

// --- НОВА ВБУДОВАНА ФУНКЦІЯ ДЛЯ КОНВЕРТАЦІЇ В WAV ---
// Вона замінює зовнішню бібліотеку audiobuffer-to-wav
function bufferToWav(aBuffer) {
    const numOfChan = aBuffer.numberOfChannels;
    const
        length = aBuffer.length * numOfChan * 2 + 44;
    const
        buffer = new ArrayBuffer(length);
    const
        view = new DataView(buffer);
    const
        channels = [];
    let i, sample;
    let offset = 0;
    let pos = 0;

    // Записуємо WAVE-заголовок
    setUint32(0x46464952); // "RIFF"
    setUint32(length - 8); // file length - 8
    setUint32(0x45564157); // "WAVE"

    setUint32(0x20746d66); // "fmt " chunk
    setUint32(16); // length = 16
    setUint16(1); // PCM (uncompressed)
    setUint16(numOfChan);
    setUint32(aBuffer.sampleRate);
    setUint32(aBuffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
    setUint16(numOfChan * 2); // block-align
    setUint16(16); // 16-bit

    setUint32(0x61746164); // "data" - chunk
    setUint32(length - pos - 4); // chunk length

    // Записуємо дані каналів
    for (i = 0; i < aBuffer.numberOfChannels; i++)
        channels.push(aBuffer.getChannelData(i));

    while (pos < length) {
        for (i = 0; i < numOfChan; i++) {
            sample = Math.max(-1, Math.min(1, channels[i][offset]));
            sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
            view.setInt16(pos, sample, true);
            pos += 2;
        }
        offset++;
    }

    return buffer;

    function setUint16(data) {
        view.setUint16(pos, data, true);
        pos += 2;
    }

    function setUint32(data) {
        view.setUint32(pos, data, true);
        pos += 4;
    }
}


// --- ОСНОВНА ЛОГІКА ДОДАТКУ (залишається майже без змін) ---
processButton.addEventListener('click', async () => {
    const file = audioFileInput.files[0];
    if (!file) {
        alert('Будь ласка, оберіть файл!');
        return;
    }

    spinner.style.display = 'inline-block';
    processButton.disabled = true;
    resultsDiv.innerHTML = '';
    
    progressContainer.style.display = 'block';
    progressBar.style.width = '0%';
    progressBar.textContent = '';
    progressText.textContent = 'Підготовка до обробки...';
    progressBar.classList.add('progress-bar-animated');

    try {
        const arrayBuffer = await file.arrayBuffer();
        const originalAudioBuffer = await audioContext.decodeAudioData(arrayBuffer);

        const totalDuration = originalAudioBuffer.duration;
        const chunkDuration = 20 * 60;
        const sampleRate = originalAudioBuffer.sampleRate;
        const numberOfChannels = originalAudioBuffer.numberOfChannels;
        const totalChunks = Math.ceil(totalDuration / chunkDuration);
        
        let startTime = 0;
        let chunkIndex = 1;

        while (startTime < totalDuration) {
            const progressPercentage = Math.round(((chunkIndex - 1) / totalChunks) * 100);
            progressBar.style.width = `${progressPercentage}%`;
            progressText.textContent = `Обробка частини ${chunkIndex} з ${totalChunks}...`;

            await new Promise(resolve => setTimeout(resolve, 10));

            const endTime = Math.min(startTime + chunkDuration, totalDuration);
            const segmentDuration = endTime - startTime;

            const chunkBuffer = audioContext.createBuffer(
                numberOfChannels,
                Math.ceil(segmentDuration * sampleRate),
                sampleRate
            );

            for (let i = 0; i < numberOfChannels; i++) {
                const channelData = originalAudioBuffer.getChannelData(i);
                const chunkChannelData = chunkBuffer.getChannelData(i);
                const startSample = Math.floor(startTime * sampleRate);
                const endSample = Math.floor(endTime * sampleRate);
                chunkChannelData.set(channelData.subarray(startSample, endSample));
            }

            // ВИКЛИКАЄМО НАШУ НОВУ ВБУДОВАНУ ФУНКЦІЮ
            const wavData = bufferToWav(chunkBuffer);
            const blob = new Blob([wavData], { type: 'audio/wav' });
            const url = URL.createObjectURL(blob);

            const link = document.createElement('a');
            link.href = url;
            link.download = `part_${chunkIndex}.wav`;
            link.className = 'btn btn-success me-2 mb-2';
            link.textContent = `Завантажити частину ${chunkIndex}`;
            resultsDiv.appendChild(link);
            
            startTime += chunkDuration;
            chunkIndex++;
        }
        
        progressText.textContent = 'Готово!';
        progressBar.style.width = '100%';
        progressBar.classList.remove('progress-bar-animated');

    } catch (error) {
        console.error('Помилка обробки файлу:', error);
        resultsDiv.innerHTML = `<div class="alert alert-danger">Виникла помилка: ${error.message}</div>`;
        progressContainer.style.display = 'none';
    } finally {
        spinner.style.display = 'none';
        processButton.disabled = false;
    }
});