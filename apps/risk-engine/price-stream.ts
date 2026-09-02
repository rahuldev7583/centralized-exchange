import { priceToBigInt18 } from "shared-types";
import { createClient } from "redis";

const STREAM_NAME = 'index-prices:events';
const GROUP_NAME = 'index-prices-processors';
const CONSUMER_NAME = `worker-${process.pid}`;

const client = createClient();

client.on('error', (err: any) =>
    console.log({ msg: 'Redis client error', err }),
);

client.connect();
console.log('Connected');

const publishClient = createClient();

async function publishPriceStream(data: any) {
    await publishClient.connect();

    const streamName = 'book-and-prices:events';

    const messageId = await client.xAdd(streamName, '*', data);
    console.log(`[Producer] Added message to stream ${streamName} with ID: ${messageId}`);

    await publishClient.disconnect();
}

// stream => index-prices:events => client => to get the index from oracle stream

// stream => book-and-prices:events => publishClient => to publish orderbook and index n mark price, to listen to risk engine, liquidation and funding fee

export const initializeStreamAndGroup = async (client: any) => {

    try {
        await client.xGroupCreate(STREAM_NAME, GROUP_NAME, '0', { MKSTREAM: true });
        console.log(`[Setup] Consumer group '${GROUP_NAME}' created.`);
    } catch (err) {

        if (err.message.includes('BUSYGROUP')) {
            //console.log(`[Setup] Consumer group '${GROUP_NAME}' already exists. Proceeding...`);
        } else {
            throw err;
        }
    }
}

export const getIndexAndMakrPrice = async () => {

    const response = await client.xReadGroup(
        GROUP_NAME,
        CONSUMER_NAME,
        { key: STREAM_NAME, id: '>' },
        { COUNT: 1, BLOCK: 5000 }
    );

    console.log({ response });

    if (!response || response.length === 0) return;

    const [{ messages }] = response;
    console.log({ messages });

    for (const message of messages) {
        const { id, message: data } = message;

        console.log({ message });
        console.log(`[Consumer] Processing message ${id}:`, data);

        const index_price = data.price;

        //const last_traded_price = ast.last_traded_price;
        const last_traded_price = 0;
        let mark_price;

        if (last_traded_price == 0) {
            mark_price = index_price;
        } else {
            mark_price = ((Number(index_price) + Number(last_traded_price)) / 2);
        }

        console.log({ index_price, mark_price });

        await client.xAck(STREAM_NAME, GROUP_NAME, id);
        console.log(`[Consumer] Acknowledged message ${id}`);
        await publishPriceStream({ index_price, mark_price });
        //return { index_price, mark_price }
    }

}

while (1) {
    //get the index price from oracle stream
    //get the asset last traded price from matching engine stream
    //publish to price stream for risk check, liquidation and funding fee

    const indexMarkPrice = await getIndexAndMakrPrice();

    //console.log({ indexMarkPrice });

    //const orderbook = await getOrderbook();
    //console.log({ orderbook });

    //await publishPriceStream(indexMarkPrice);

}
