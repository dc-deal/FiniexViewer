/**
 * The contract this viewer mirrors — every type in `src/types/api/` follows this one and no other.
 *
 * The backend stamps the contract it serves on every response (`X-Api-Contract`), and the fixtures
 * were captured under the number in their manifest; the contract test holds the two together, and
 * the menu bar says where the server stamps another. Raised together with the mirror and the
 * fixtures, never alone, and only after reading `GET /api/v1/contract`, whose `changes` say what
 * moved.
 */
export const EXPECTED_CONTRACT = 45
