// 音声と映像を取得
var options = { audio: true, video: true };
// アクセスを許可するかのウィンドウが表示
navigator.mediaDevices.getUserMedia(options)
  .then(mediaStream => { // 許可
    var src = window.URL.createObjectURL(mediaStream);
    var video = document.createElement('video');
    video.src = src;
    video.autoplay = true;
    document.body.appendChild(video);
  })
  .catch(error => { // 否認 or エラー
    console.log('failed to access camera', error);
  });
