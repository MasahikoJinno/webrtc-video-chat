import * as React from 'react';
import * as firebase from 'firebase';
import './App.css';

type REQUEST_OFFER = 'REQUEST_OFFER';
const REQUEST_OFFER: REQUEST_OFFER = 'REQUEST_OFFER';

type OFFER = 'OFFER';
const OFFER: OFFER = 'OFFER';

type ANSWER = 'ANSWER';
const ANSWER: ANSWER = 'ANSWER';

interface RequestOfferMessage {
  type: REQUEST_OFFER;
  from: string;
  timestamp: number;
}

interface SDPMessage {
  type: OFFER | ANSWER;
  sdp: string;
  from: string;
}

interface Props {
  roomName: string;
}
interface State {
  localMediaStream?: MediaStream;
  localSrc?: string;
  remotes: Array<{
    mediaStream: MediaStream;
    src: string;
  }>;
}

class App extends React.Component<Props, State> {
  peers: {
    [clientId: string]: RTCPeerConnection;
  };
  db: firebase.database.Database;

  constructor(props: Props) {
    super(props);
    this.state = {
      remotes: []
    };

    // 各クライアント毎のRTCPeerConnectionを保持
    this.peers = {};
    this.db = firebase.database();
  }

  getClientId() {
    let clientId = window.localStorage['clientId'];
    if (clientId == null) {
      clientId = this.generateClientId();
      window.localStorage.setItem('clientId', clientId);
    }
    return clientId;
  }

  // クライアントIDを生成
  generateClientId() {
    return this.db.ref('rooms/test-room/clients').push().key;
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
        this.enterRoom();
      });
  }

  broadcastRef() {
    const { roomName } = this.props;
    return firebase.database().ref(`rooms/${roomName}/broadcast`);
  }

  directRef(id: string) {
    const { roomName } = this.props;
    return firebase.database().ref(`rooms/${roomName}/users/${id}/direct`);
  }

  enterRoom() {
    const clientId = this.getClientId();
    const enteredAt = Date.now();

    // 全員へのメッセージ送信を監視
    const broadcastRef = this.broadcastRef();
    broadcastRef.on('child_added', data => {
      if (data == null) {
        return;
      }

      const message: RequestOfferMessage | null = data.val();
      if (message == null) {
        return;
      }

      if (message.from === clientId || message.timestamp < enteredAt) {
        // 自分からのメッセージ無視
        // 自分が入室したより前のメッセージは無視
        return;
      } else if (message.type === REQUEST_OFFER) {
        console.log('child_added broadcast', message.from);
        // Offer送信のリクエスト
        this.createOffer(message.from);
      }
    });

    // 自分へのメッセージ送信を監視
    const directRef = this.directRef(clientId);
    directRef.on('child_added', data => {
      if (data == null) {
        return;
      }

      const message:SDPMessage = data.val();
      if (message.type === OFFER) {
        this.receiveOffer(message.from, message.sdp);
      } else if (message.type === ANSWER) {
        this.receiveAnswer(message.from, message.sdp);
      }

      data.ref.remove();
    });

    // 全員に送信
    this.sendRequestOffer();
  }

  sendRequestOffer() {
    const clientId = this.getClientId();
    this.broadcastRef().push({
        type: REQUEST_OFFER,
        from: clientId,
        timestamp: Date.now()
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
  createOffer(toClientId: string) {
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
        this.sendOffer(toClientId, peer.localDescription);
      }
    };

    // OfferのSDPの生成
    peer
      .createOffer()
      // 生成されたSDPをRTCPeerConnectionに設定
      .then(sessionDescription => peer.setLocalDescription(sessionDescription))
      .catch(error => console.log('failed to peer.createOffer()'));

    // RTCPeerConnectionを保持
    this.peers[toClientId] = peer;
  }

  // toClientIdのクライアントに向けてSDPを送信
  sendOffer(toClientId: string, sd: RTCSessionDescription) {
    const clientId = this.getClientId();
    this.directRef(toClientId).push({
      from: clientId,
      type: OFFER,
      sdp: sd.sdp == null ? '' : sd.sdp
    });
  }

  // Offer SDPの受信時
  receiveOffer(fromClientId: string, offerSdp: string) {
    console.log('receiveOffer', fromClientId, offerSdp);

    // RTCPeerConnectionを生成
    const peer = this.createPeerConnection();
    // ICE Candidateが収集された時のコールバック
    peer.onicecandidate = event => {
      if (event.candidate) {
        // ICE Candidateが収集されるたびに実行
      } else if (peer.localDescription != null) {
        // ICE Candidateが出揃った時
        // Offer SDPを送ったクライアントに送り返している
        this.sendAnswer(fromClientId, peer.localDescription);
      }
    };
    // コピペされたテキストのSDPからRTCSessionDescriptionを生成
    const offer = new RTCSessionDescription({
      type: 'offer',
      sdp: offerSdp
    });
    // Offer SDPをRTCPeerConnectionに設定、Answer SDPを生成
    peer
      .setRemoteDescription(offer)
      .then(() => peer.createAnswer())
      .then(sd => peer.setLocalDescription(sd))
      .catch(error => console.log('failed to receiveOffer'));

    // peerを保持
    this.peers[fromClientId] = peer;
  }

  // Answer SDPの送信
  sendAnswer(toClientId: string, sd: RTCSessionDescription) {
    const clientId = this.getClientId();
    this.directRef(toClientId).push({
      from: clientId,
      type: ANSWER,
      sdp: sd.sdp == null ? '' : sd.sdp
    });
  }

  // Receive answerが押された時の処理
  receiveAnswer(fromClientId: string, sdp: string) {
    console.log('receiveAnswer', fromClientId, sdp);

    const peer = this.peers[fromClientId];
    if (peer == null) {
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

  receiveMediaStream(mediaStream: MediaStream) {
    this.setState({
      remotes: this.state.remotes.concat({
        mediaStream,
        src: window.URL.createObjectURL(mediaStream)
      })
    });
  }

  render() {
    const { localSrc, remotes } = this.state;

    return (
      <div className="App">
        <div className="App__videoarea">
          <h3>自分</h3>
          {localSrc == null
            ? <p>読み込み中...</p>
            : <video width="250" src={localSrc} autoPlay={true} />}
        </div>
        <div className="App__videoarea">
          <h3>相手</h3>
          <div>
            {remotes.map(remote =>
              <video width="250" src={remote.src} autoPlay={true} />
            )}
          </div>
        </div>
      </div>
    );
  }
}

export default App;
