export const transferTemplate = `Given the recent messages and wallet information below:

{{recentMessages}}

{{walletInfo}}

Extract the following information about the requested transfer:
- Chain to execute on (like in viem/chains)
- Amount to transfer (only number without coin symbol)
- Recipient address

Respond with a JSON markdown block containing only the extracted values:

\`\`\`json
{
    "fromChain": "ethereum" | "base" | ...,
    "amount": string,
    "toAddress": string
}
\`\`\`
`;

export const bridgeTemplate = `Given the recent messages and wallet information below:

{{recentMessages}}

{{walletInfo}}

Extract the following information about the requested token bridge:
- Token symbol or address to bridge
- Source chain (ethereum or base)
- Destination chain (ethereum or base)
- Amount to bridge
- Destination address (if specified)

Respond with a JSON markdown block containing only the extracted values:

\`\`\`json
{
    "token": string | null,
    "fromChain": "ethereum" | "base" | null,
    "toChain": "ethereum" | "base" | null,
    "amount": string | null,
    "toAddress": string | null
}
\`\`\`
`;

export const swapTemplate = `Given the recent messages and wallet information below:

{{recentMessages}}

{{walletInfo}}

Extract the following information about the requested token swap:
- Input token symbol or address (the token being sold)
- Output token symbol or address (the token being bought)
- Amount to swap
- Chain to execute on (ethereum or base)

Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined:

\`\`\`json
{
    "inputToken": string | null,
    "outputToken": string | null,
    "amount": string | null,
    "chain": "ethereum" | "base" | null,
    "slippage": number | null
}
\`\`\`
`;
