export const formatAddress = (address: string): string => {
    if (!address)
        return "";
    return address.length <= 24 ? address : `${address.slice(0, 10)}…${address.slice(-8)}`;
};
