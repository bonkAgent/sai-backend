export const JITOSOL_MINT = "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn";
export const JPOOL_MINT = "7Q2afV64in6N6SeZsAAB81TJzwDoD6zpqmHkzi9Dcavn";

export function formatBlock({ platform, apy, url, type, description, token }: any) {
    return [
        `### ${platform}`,
        `**Type:** ${type}`,
        `**APY:** ${apy}`,
        `**Description:** ${description}`,
        `**Website:** [${url}](${url})`,
        '',
        `**Token:** ${token?.name || '-'} (${token?.symbol || '-'})`,
        `**Address:** \`${token?.address || '-'}\``,
        `**Price:** ${token?.priceUsd ? `${Number(token.priceUsd).toFixed(2)} USD` : 'N/A'}`
    ].join('\n');
}