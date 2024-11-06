import {
    Action,
    ActionExample,
    Content,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    State,
    UUID,
    ModelClass,
} from "../core/types.ts";

import { composeContext } from "../core/context.ts";
import { generateText } from "../core/generation.ts";

const API_URL = "https://api.dexscreener.com";

interface TokenPair {
    chainId: string;
    dexId: string;
    pairAddress: string;
    baseToken: {
        address: string;
        name: string;
        symbol: string;
    };
    quoteToken: {
        address: string;
        name: string;
        symbol: string;
    };
    marketCap: number;
    priceNative: string;
    priceUsd: string;
    txns: {
        h24: {
            buys: number;
            sells: number;
        };
    };
    volume: {
        h24: number;
    };
    liquidity: {
        usd: number;
        base: number;
        quote: number;
    };
    pairCreatedAt: number;
    url: string;
}

interface DexScreenerResponse {
    schemaVersion: string;
    pairs: TokenPair[];
}
export const cashtagHandlerTemplate = `

{{recentMessages}}

{{attachments}}

{{messageDirections}}

# Instructions: Respond with a short message max 50 words in responses the users last message - respond in PLAIN TEXT (do not use Markdown) with the asked for token information always include the Dexscreener URL and Current Market Cap unless asked otherwise`;

/**
 * Cleans a string by removing dollar signs, spaces, and converting to lowercase
 *
 * @param {string} input - The string to clean
 * @returns {string} The cleaned string
 * @throws {Error} If input is not a string
 *
 * @example
 * cleanString("$Hello World$") // returns "helloworld"
 * cleanString("$100.00 USD") // returns "100.00usd"
 * cleanString("  MIXED case  $STRING$ ") // returns "mixedcasestring"
 */
function cleanString(input) {
    // Input validation
    if (typeof input !== "string") {
        throw new Error("Input must be a string");
    }

    // Remove dollar signs, remove spaces, and convert to lowercase
    return input
        .replace(/\$/g, "") // Remove all dollar signs
        .replace(/\s+/g, "") // Remove all whitespace (spaces, tabs, newlines)
        .toLowerCase(); // Convert to lowercase
}

function calculatePairScore(pair: TokenPair): number {
    let score = 0;

    // Age score (older is better) - 20 points max
    const ageInDays = (Date.now() - pair.pairCreatedAt) / (1000 * 60 * 60 * 24);
    score += (Math.min(ageInDays, 365) / 365) * 20;

    // Liquidity score - 25 points max
    const liquidityScore =
        (Math.min(pair.liquidity?.usd || 0, 1000000) / 1000000) * 25;
    score += liquidityScore;

    // Volume score (24h) - 25 points max
    const volumeScore =
        (Math.min(pair.volume?.h24 || 0, 1000000) / 1000000) * 25;
    score += volumeScore;

    // Transaction score (24h) - 30 points max
    const txCount = (pair.txns?.h24?.buys || 0) + (pair.txns?.h24?.sells || 0);
    const txScore = (Math.min(txCount, 1000) / 1000) * 30;
    score += txScore;

    return score;
}

interface SearchResponse {
    success: boolean;
    data?: TokenPair | null;
    error?: string;
}

export const searchCashTags = async (
    cashtag: string
): Promise<SearchResponse> => {
    // Fetch data from DexScreener API
    const _cashtag = cleanString(cashtag);
    const apiUrl = `${API_URL}/latest/dex/search?q=${_cashtag}`;

    const response = await fetch(apiUrl, {
        method: "GET",
        headers: {
            Accept: "application/json",
        },
    });

    if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
    }

    const data = (await response.json()) as DexScreenerResponse;

    if (!data.pairs || data.pairs.length === 0) {
        return {
            success: false,
            error: `No matching pairs found for ${_cashtag}`,
        };
    }

    // Score and sort pairs
    const scoredPairs = data.pairs.map((pair) => ({
        ...pair,
        score: calculatePairScore(pair),
    }));

    const sortedPairs = scoredPairs.sort((a, b) => b.score - a.score);
    return { success: true, data: sortedPairs[0] };
};

export const cashtags: Action = {
    name: "FIND_BEST_CASHTAG_MATCH",
    similes: ["FIND_TOKEN", "SEARCH_TOKEN", "GET_TOKEN", "FIND_PAIR"],
    description:
        "Searches for the best matching token pair (ca) or $cashtag ($SOL) based on age, liquidity, volume, and transaction count",
    validate: async (runtime: IAgentRuntime, message: Memory, state: State) => {
        return true;
    },
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        options: any,
        callback: HandlerCallback
    ) => {
        const userId = runtime.agentId;
        const { roomId } = message;

        // Extract cashtag from message
        const cashtag = message.content.text
            .match(/\$[A-Za-z]+/)?.[0]
            ?.replace("$", "");
        let responseContent;

        const callbackData: Content = {
            text: undefined,
            action: "FIND_BEST_MATCH_RESPONSE",
            source: "DEXSCREENER",
            attachments: [],
        };

        if (!cashtag) {
            // callback({
            //     text: "No cashtag found in the message. Please include a cashtag (e.g. $PNUT)",
            //     action: "FIND_BEST_MATCH_RESPONSE",
            //     source: "DexScreener",
            // });
            callbackData.text =
                "No cashtag found in the message. Please include a cashtag (e.g. $PNUT)";

            return;
        }

        console.log(
            `[${roomId}] Processing FIND_BEST_MATCH request... $`,
            cashtag
        );

        try {
            const { data: bestMatch, error } = await searchCashTags(cashtag);

            if (error) {
                callbackData.text = error;
                // callback(callbackData);
                return;
            }

            // Format response
            const responseText = `
            Best match for $${cashtag}:
            Token: ${bestMatch.baseToken.name} (${bestMatch.baseToken.symbol})
            MCAP: $${bestMatch.marketCap.toFixed(2)}M
            Age: ${Math.floor((Date.now() - bestMatch.pairCreatedAt) / (1000 * 60 * 60 * 24))} days
            Liquidity: $${bestMatch.liquidity.usd.toLocaleString()}
            24h Volume: $${bestMatch.volume.h24.toLocaleString()}
            24h Transactions: ${(bestMatch.txns.h24.buys + bestMatch.txns.h24.sells).toLocaleString()}
            Price: $${bestMatch.priceUsd}
            DEX: ${bestMatch.dexId}
            Pair Address: ${bestMatch.pairAddress}

            URL: ${bestMatch.url}`;

            callbackData.text = responseText;

            // Store the full response as an attachment
            const attachmentId =
                `dex-${Date.now()}-${Math.floor(Math.random() * 1000)}`.slice(
                    -5
                );
            callbackData.attachments.push({
                id: attachmentId,
                url: bestMatch.url,
                title: `Best Match for $${cashtag}`,
                source: "DEXSCREENER",
                description: `Token analysis for ${bestMatch.baseToken.symbol}`,
                text: JSON.stringify(bestMatch, null, 2),
            });

            // Log to database
            runtime.databaseAdapter.log({
                body: { message, response: bestMatch },
                userId: userId as UUID,
                roomId,
                type: "dexscreener",
            });
        } catch (error) {
            console.error("Error in findBestMatch:", error);
            callbackData.text = `Error processing request: ${error.message}`;
            callback(callbackData);
            return;
        }

        const memory: Memory = {
            agentId: runtime.agentId,
            userId,
            roomId,
            content: callbackData,
            createdAt: Date.now(),
        };

        // Update state with the new memory
        state = await runtime.composeState(memory);

        const context = composeContext({
            state,
            template: cashtagHandlerTemplate,
        });

        responseContent = await generateText({
            runtime,
            context,
            modelClass: ModelClass.SMALL,
        });

        if (!responseContent) {
            return;
        }
        const agentMessage = {
            userId,
            roomId,
            agentId: runtime.agentId,
        };

        const content = {
            text: responseContent,
            action: "FIND_BEST_MATCH_RESPONSE",
            source: "DEXSCREENER",
        };

        // save response to memory
        const responseMessage = {
            ...agentMessage,
            userId: runtime.agentId,
            content: content,
        };

        await runtime.messageManager.createMemory(responseMessage);
        callbackData.content = responseContent;
        callback(content);
        return callbackData;
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Can you find information about $PNUT?",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Let me search for the best matching pair...",
                    action: "FIND_BEST_CASHTAG_MATCH",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "What's the current status of $SOL?",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "I'll look up the token information...",
                    action: "FIND_BEST_CASHTAG_MATCH",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Find me the most liquid pair for $BTC",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Searching for the best BTC pair...",
                    action: "FIND_BEST_CASHTAG_MATCH",
                },
            },
        ],
    ] as ActionExample[][],
} as Action;
