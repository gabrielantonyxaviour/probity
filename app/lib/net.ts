// Node's default per-address connect attempt is 250 ms before it tries the next address family. On networks where the IPv6
// address of a public API is dead and the IPv4 handshake takes a few hundred milliseconds, every fetch to it then fails with
// ETIMEDOUT while curl works (seen live with api.usaspending.gov, 2026-10-27). Give each attempt room.
import net from "node:net";

net.setDefaultAutoSelectFamilyAttemptTimeout(5000);
export {};
