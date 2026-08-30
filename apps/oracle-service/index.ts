import { WebSocket } from 'ws';

const BINANCE_WS_STREAM_URL = process.env.BINANCE_WS_STREAM_URL || '';

if (!BINANCE_WS_STREAM_URL) {
    console.log("Invalid BINANCE_WS_STREAM_URL");
}

const ws = new WebSocket(BINANCE_WS_STREAM_URL);

ws.on('open', () => {
    console.log('Connected to server');
});

ws.on('message', (data) => {
    console.log(`Received: ${data.toString()}`);
    const parsed_data = JSON.parse(data.toString());

    const symbol = parsed_data.stream;

    console.log({ symbol });

    const trade = parsed_data.data;

    console.log({ trade });


});

ws.on('error', console.error);
ws.on('close', () => console.log('Disconnected'));