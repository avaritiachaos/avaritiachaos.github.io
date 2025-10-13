self.addEventListener('install', function(event) {
    // 禁用自动更新
    event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', function(event) {
    // 禁用自动更新
    event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', function(event) {
    // 禁用自动更新
    event.respondWith(fetch(event.request));
});

// 音频播放状态管理
let audioContext = null;
let audioElement = null;
let audioSource = null;
let isPlaying = false;

self.addEventListener('message', function(event) {
    if (event.data.action === 'play') {
        if (!audioContext) {
            audioContext = new AudioContext();
            audioElement = new Audio(event.data.url);
            audioSource = audioContext.createMediaElementSource(audioElement);
            audioSource.connect(audioContext.destination);
        }
        if (!isPlaying) {
            audioElement.play();
            isPlaying = true;
        }
    } else if (event.data.action === 'pause') {
        if (audioElement && isPlaying) {
            audioElement.pause();
            isPlaying = false;
        }
    }
}); 