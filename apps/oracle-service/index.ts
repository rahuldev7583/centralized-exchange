import { createClient } from 'redis';
import { WebSocket } from 'ws';

const client = createClient();

client.connect();
console.log('Connected');
client.on('error', (err) => console.error('Redis Client Error', err));

//index-prices:events => stream index prices 

const BINANCE_WS_STREAM_URL = process.env.BINANCE_WS_STREAM_URL || '';

if (!BINANCE_WS_STREAM_URL) {
    console.log("Invalid BINANCE_WS_STREAM_URL");
}

const ws = new WebSocket(BINANCE_WS_STREAM_URL);

const pushToRedisStream = async (data: any) => {
    try {
        const streamName = 'index-prices:events';
        const messageId = await client.xAdd(streamName, '*', data);
        console.log(`[Producer] Event written successfully with ID: ${messageId}`);

        return;
    } catch (error) {
        console.log({ error });

    }

}

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

    const asset = {
        symbol: symbol.slice(0, 3).toUpperCase(),
        timestamp: trade.T.toString(),
        price: trade.p.toString()
    };

    console.log({ asset });

    console.log("Asset Price push to matching engine, risk engine redis stream");
    pushToRedisStream(asset)

});

ws.on('error', console.error);
ws.on('close', () => console.log('Disconnected'));