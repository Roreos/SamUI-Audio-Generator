const SamJs = require('sam-js');

class SAMTTSApp {
    constructor() {
        this.isPlaying = false;
        this.currentAudio = null;
        this.audioContext = null;
        this.virtualMicStream = null;
        
        this.initializeElements();
        this.setupEventListeners();
        this.initializeAudioContext();
        this.loadAudioDevices();
    }

    initializeElements() {
        this.textInput = document.getElementById('text-input');
        this.pitchSlider = document.getElementById('pitch');
        this.speedSlider = document.getElementById('speed');
        this.mouthSlider = document.getElementById('mouth');
        this.throatSlider = document.getElementById('throat');
        this.volumeSlider = document.getElementById('volume');
        this.outputDevice = document.getElementById('output-device');
        this.micOutput = document.getElementById('mic-output');
        this.speakBtn = document.getElementById('speak-btn');
        this.stopBtn = document.getElementById('stop-btn');
        this.previewBtn = document.getElementById('preview-btn');
        this.status = document.getElementById('status');
        this.waveform = document.getElementById('waveform');
        
        // Value display elements
        this.pitchValue = document.getElementById('pitch-value');
        this.speedValue = document.getElementById('speed-value');
        this.mouthValue = document.getElementById('mouth-value');
        this.throatValue = document.getElementById('throat-value');
        this.volumeValue = document.getElementById('volume-value');
    }

    setupEventListeners() {
        // Slider value updates
        this.pitchSlider.addEventListener('input', (e) => {
            this.pitchValue.textContent = e.target.value;
        });
        
        this.speedSlider.addEventListener('input', (e) => {
            this.speedValue.textContent = e.target.value;
        });
        
        this.mouthSlider.addEventListener('input', (e) => {
            this.mouthValue.textContent = e.target.value;
        });
        
        this.throatSlider.addEventListener('input', (e) => {
            this.throatValue.textContent = e.target.value;
        });
        
        this.volumeSlider.addEventListener('input', (e) => {
            this.volumeValue.textContent = e.target.value + '%';
        });

        // Button events
        this.speakBtn.addEventListener('click', () => this.speak());
        this.stopBtn.addEventListener('click', () => this.stop());
        this.previewBtn.addEventListener('click', () => this.preview());

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'Enter') {
                this.speak();
            } else if (e.key === 'Escape') {
                this.stop();
            }
        });
    }

    async initializeAudioContext() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.updateStatus('Audio system initialized', 'ready');
        } catch (error) {
            console.error('Failed to initialize audio context:', error);
            this.updateStatus('Audio initialization failed', 'error');
        }
    }

    async loadAudioDevices() {
        try {
            // Get available audio output devices
            const devices = await navigator.mediaDevices.enumerateDevices();
            const audioOutputs = devices.filter(device => device.kind === 'audiooutput');
            
            // Clear existing options except default
            this.outputDevice.innerHTML = '<option value="default">Default Speakers</option>';
            
            // Add available audio output devices
            audioOutputs.forEach(device => {
                if (device.deviceId !== 'default') {
                    const option = document.createElement('option');
                    option.value = device.deviceId;
                    option.textContent = device.label || `Audio Output ${device.deviceId.slice(0, 8)}`;
                    this.outputDevice.appendChild(option);
                }
            });
        } catch (error) {
            console.error('Failed to load audio devices:', error);
        }
    }

    generateSpeech(text) {
        const options = {
            pitch: parseInt(this.pitchSlider.value),
            speed: parseInt(this.speedSlider.value),
            mouth: parseInt(this.mouthSlider.value),
            throat: parseInt(this.throatSlider.value)
        };

        try {
            // Generate audio buffer using SAM
            const audioBuffer = SamJs.buf8(text, options);
            
            if (!audioBuffer || audioBuffer.length === 0) {
                throw new Error('Failed to generate audio');
            }

            return this.createAudioFromBuffer(audioBuffer);
        } catch (error) {
            console.error('Speech generation error:', error);
            throw error;
        }
    }

    createAudioFromBuffer(buffer) {
        // Convert 8-bit buffer to 16-bit PCM
        const pcmData = new Int16Array(buffer.length);
        for (let i = 0; i < buffer.length; i++) {
            pcmData[i] = (buffer[i] - 128) * 256;
        }

        // Create audio buffer
        const audioBuffer = this.audioContext.createBuffer(1, pcmData.length, 22050);
        const channelData = audioBuffer.getChannelData(0);
        
        for (let i = 0; i < pcmData.length; i++) {
            channelData[i] = pcmData[i] / 32768;
        }

        return audioBuffer;
    }

    async playAudio(audioBuffer, routeToMic = false) {
        if (!this.audioContext) {
            throw new Error('Audio context not initialized');
        }

        const source = this.audioContext.createBufferSource();
        const gainNode = this.audioContext.createGain();
        
        source.buffer = audioBuffer;
        gainNode.gain.value = parseInt(this.volumeSlider.value) / 100;
        
        source.connect(gainNode);

        if (routeToMic && this.micOutput.checked) {
            // Route to virtual microphone (this would require additional setup)
            await this.routeToVirtualMicrophone(gainNode);
        } else {
            // Route to speakers
            gainNode.connect(this.audioContext.destination);
        }

        return new Promise((resolve, reject) => {
            source.onended = () => {
                this.isPlaying = false;
                this.updateStatus('Ready', 'ready');
                this.updateButtons();
                this.waveform.classList.remove('active');
                resolve();
            };

            source.onerror = (error) => {
                this.isPlaying = false;
                this.updateStatus('Playback error', 'error');
                this.updateButtons();
                this.waveform.classList.remove('active');
                reject(error);
            };

            this.currentAudio = source;
            source.start();
        });
    }

    async routeToVirtualMicrophone(audioNode) {
        try {
            // This is a simplified implementation
            // In a real app, you'd need to set up a virtual audio device
            const destination = this.audioContext.createMediaStreamDestination();
            audioNode.connect(destination);
            
            // You would typically route this stream to a virtual microphone driver
            console.log('Audio routed to virtual microphone stream');
            
        } catch (error) {
            console.error('Failed to route to virtual microphone:', error);
            // Fallback to regular speakers
            audioNode.connect(this.audioContext.destination);
        }
    }

    async speak() {
        const text = this.textInput.value.trim();
        
        if (!text) {
            this.updateStatus('Please enter some text', 'error');
            return;
        }

        if (this.isPlaying) {
            this.stop();
            return;
        }

        try {
            this.isPlaying = true;
            this.updateStatus('Generating speech...', 'speaking');
            this.updateButtons();
            this.waveform.classList.add('active');

            const audioBuffer = this.generateSpeech(text);
            
            this.updateStatus('Speaking...', 'speaking');
            await this.playAudio(audioBuffer, true);
            
        } catch (error) {
            console.error('Speech error:', error);
            this.updateStatus('Speech generation failed', 'error');
            this.isPlaying = false;
            this.updateButtons();
            this.waveform.classList.remove('active');
        }
    }

    async preview() {
        const text = this.textInput.value.trim();
        
        if (!text) {
            this.updateStatus('Please enter some text', 'error');
            return;
        }

        if (this.isPlaying) {
            this.stop();
            return;
        }

        try {
            this.isPlaying = true;
            this.updateStatus('Generating preview...', 'speaking');
            this.updateButtons();
            this.waveform.classList.add('active');

            const audioBuffer = this.generateSpeech(text);
            
            this.updateStatus('Playing preview...', 'speaking');
            await this.playAudio(audioBuffer, false); // Don't route to mic for preview
            
        } catch (error) {
            console.error('Preview error:', error);
            this.updateStatus('Preview failed', 'error');
            this.isPlaying = false;
            this.updateButtons();
            this.waveform.classList.remove('active');
        }
    }

    stop() {
        if (this.currentAudio) {
            this.currentAudio.stop();
            this.currentAudio = null;
        }
        
        this.isPlaying = false;
        this.updateStatus('Stopped', 'ready');
        this.updateButtons();
        this.waveform.classList.remove('active');
    }

    updateStatus(message, type = 'ready') {
        this.status.textContent = message;
        this.status.className = `status-indicator ${type}`;
    }

    updateButtons() {
        this.speakBtn.disabled = false;
        this.previewBtn.disabled = false;
        this.stopBtn.disabled = !this.isPlaying;
        
        if (this.isPlaying) {
            this.speakBtn.textContent = '⏸️ Pause';
            this.previewBtn.textContent = '⏸️ Pause';
        } else {
            this.speakBtn.textContent = '🎤 Speak';
            this.previewBtn.textContent = '🔊 Preview';
        }
    }
}

// Initialize the app when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new SAMTTSApp();
});

// Handle window focus for audio context
window.addEventListener('focus', () => {
    if (window.audioContext && window.audioContext.state === 'suspended') {
        window.audioContext.resume();
    }
});