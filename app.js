// Запускаємо весь наш код тільки тоді, коли сторінка повністю завантажена
document.addEventListener('DOMContentLoaded', () => {

    // Весь ваш попередній код з app.js тепер знаходиться всередині цієї функції
    const processButton = document.getElementById('processButton');
    const audioFileInput = document.getElementById('audioFile');
    const resultsDiv = document.getElementById('results');
    const spinner = processButton.querySelector('.spinner-border');
    const progressContainer = document.getElementById('progressContainer');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');

    const audioContext = new (window.AudioContext || window.webkitAudioContext)();

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

                const wavData = audiobufferToWav(chunkBuffer); // Тепер ця функція буде визначена
                const blob = new Blob([new DataView(wavData)], { type: 'audio/wav' });
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

}); // Не забудьте закрити слухач подій