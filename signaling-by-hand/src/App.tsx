import * as React from 'react';
import './App.css';

interface State {
  peer?: RTCPeerConnection,
  localMediaStream?: MediaStream,
  localSrc?: string,
  remoteMediaStream?: MediaStream,
  remoteSrc?: string,
  offer: string,
  isOfferCreated: boolean,
  isOfferReceived: boolean,
  answer: string,
  isAnswerCreated: boolean
}

class App extends React.Component<{}, State> {
  constructor(props: {}) {
    super(props);
    this.state = {
      offer: '',
      isOfferCreated: false,
      isOfferReceived: false,
      answer: '',
      isAnswerCreated: false
    };
  }

  // AppコンポーネントがDOMに
  // マウントされた後に呼び出される
  componentDidMount() {
    // カメラに接続
    navigator.mediaDevices
      .getUserMedia({ audio: true, video: true })
      .then(mediaStream => {
        // MediaStream、動画URLを保持
        this.setState({
          localMediaStream: mediaStream,
          localSrc: window.URL.createObjectURL(mediaStream)
        });
      });
  }

  // RTCPeerConnectionの生成
  // コンストラクタ引数、onaddstream、addStreamの呼び出しは共通
  createPeerConnection() {
    if (this.state.localMediaStream == null) {
      throw new Error('localMediaStream is not found');
    }
    // インスタンス生成
    // iceServersにSTUNやTURNのアドレスを記述
    const peer = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
      ]
    });
    // 接続先からMediaStreamが追加された時に実行
    peer.onaddstream = e => {
      if (e.stream != null) {
        // 接続が完了し
        this.receiveMediaStream(e.stream);
      }
    };
    // ローカルカメラのMediaStreamを登録
    peer.addStream(this.state.localMediaStream);

    return peer;
  }

  // Create offerボタンが押された時の処理
  createOffer() {
    if (this.state.localMediaStream == null) {
      return;
    }
    // RTCPeerConnectionの生成
    const peer = this.createPeerConnection();
    // ICE Candidateが収集された時のコールバック
    peer.onicecandidate = event => {
      if (event.candidate) {
        // ICE Candidateが収集されるたびに実行
        // 都度相手側に送ると接続が早くなる（Trickle ICE）
      } else if (peer.localDescription != null) {
        // ICE Candidateが出揃った後にまとめて送る（Vanilla ICE）
        this.showOffer(peer.localDescription);
      }
    };

    // OfferのSDPの生成
    peer
      .createOffer()
      // 生成されたSDPをRTCPeerConnectionに設定
      .then(sessionDescription => peer.setLocalDescription(sessionDescription))
      .catch(error => console.log('failed to peer.createOffer()'));
    // RTCPeerConnectionを保持
    this.setState({ peer });
  }

  showOffer(sd: RTCSessionDescription) {
    this.setState({
      offer: sd.sdp == null ? '' : sd.sdp,
      isOfferCreated: true
    });
  }

  // Receive offerボタンが押された時の処理
  receiveOffer() {
    if (this.state.isOfferCreated) {
      return;
    }
    // RTCPeerConnectionを生成
    const peer = this.createPeerConnection();
    // ICE Candidateが収集された時のコールバック
    peer.onicecandidate = event => {
      if (event.candidate) {
        // ICE Candidateが収集されるたびに実行
      } else if (peer.localDescription != null) {
        // ICE Candidateが出揃った時
        this.showAnswer(peer.localDescription);
      }
    };
    // コピペされたテキストのSDPからRTCSessionDescriptionを生成
    const offer = new RTCSessionDescription({
      type: 'offer',
      sdp: this.state.offer
    });
    // Offer SDPをRTCPeerConnectionに設定、Answer SDPを生成
    peer
      .setRemoteDescription(offer)
      .then(() => peer.createAnswer())
      .then(sd => peer.setLocalDescription(sd))
      .catch(error => console.log('failed to receiveOffer'));
    // peerを保持
    this.setState({ peer });
  }

  showAnswer(sd: RTCSessionDescription) {
    this.setState({
      answer: sd.sdp == null ? '' : sd.sdp,
      isAnswerCreated: true
    });
  }

  // Receive answerが押された時の処理
  receiveAnswer() {
    const { peer, answer: sdp } = this.state;
    if (peer == null || sdp === '') {
      return;
    }
    // コピペされたテキストのSDPからRTCSessionDescriptionを生成
    const answer = new RTCSessionDescription({
      type: 'answer',
      sdp
    });
    // AnswerのSDPをRTCPeerConnectionに設定
    // 接続が完了すれば接続先のMediaStreamが流れてくる
    peer
      .setRemoteDescription(answer)
      .catch(error => console.log('failed to set answer', error));
  }

  // 接続先からMediaStreamを受信
  receiveMediaStream(mediaStream: MediaStream) {
    this.setState({
      remoteMediaStream: mediaStream,
      remoteSrc: window.URL.createObjectURL(mediaStream)
    });
  }

  render() {
    const {
      localSrc,
      remoteSrc,
      offer,
      isOfferCreated,
      isOfferReceived,
      answer
    } = this.state;

    return (
      <div className="App">
        <div className="App__videoarea">
          <h3>自分</h3>
          {localSrc == null
            ? <p>読み込み中...</p>
            : <video width="250" src={localSrc} autoPlay={true} />}

          <div>
            <h4>Offer SDP</h4>
            <textarea
              className="App__textarea"
              value={offer}
              disabled={isOfferCreated || isOfferReceived}
              onChange={e => this.setState({ offer: e.target.value })}
            />
            <div>
              <button
                disabled={localSrc == null || isOfferCreated || isOfferReceived}
                onClick={() => this.createOffer()}
              >
                Create offer
              </button>
              <button
                disabled={localSrc == null || isOfferCreated || isOfferReceived}
                onClick={() => this.receiveOffer()}
              >
                Receive offer
              </button>
            </div>
          </div>
        </div>
        <div className="App__videoarea">
          <h3>相手</h3>
          {remoteSrc == null
            ? <p className="App__loading">未接続</p>
            : <video width="250" src={remoteSrc} autoPlay={true} />}

          <div>
            <h4>Answer SDP</h4>
            <textarea
              className="App__textarea"
              value={answer}
              onChange={e => this.setState({ answer: e.target.value })}
            />
            <div>
              <button
                disabled={!isOfferCreated || answer === ''}
                onClick={() => this.receiveAnswer()}
              >
                Receive answer
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}

export default App;
