# BSV Integration — Research Findings

Verified before implementing the transaction constructor. See the protocol spec and BSV genesis limits.

## SDK Selection

**Chosen: raw transaction encoding — no external SDK dependency.**

`@bsv/sdk` (official BSV Association TypeScript SDK, released April 2024,
GitHub: `bsv-blockchain/ts-stack`) is the right choice for application-level
BSV work. However, for SAMIZDAT's core transaction constructor we use raw binary
encoding instead:

- Zero external dependencies for the protocol core (auditable, portable)
- The encoding is fully specified here and can be re-implemented in any language
- Integrators who want `@bsv/sdk` can wrap `BsvTxBackend` themselves

## Data-Carrier P2PKH Convention (BSV Post-Genesis)

On BSV post-Genesis (block 620538, Feb 2020), SAMIZDAT embeds payloads in a
**data-carrier P2PKH locking script**:

```
<PUSHDATA(blob)> OP_DROP OP_DUP OP_HASH160 <20-byte-hash> OP_EQUALVERIFY OP_CHECKSIG
```

- The blob is pushed and immediately dropped (`OP_DROP` = `0x75`)
- The remaining P2PKH suffix is spendable by the author's key
- Each data-carrier output carries 1 satoshi (dust convention)
- Block explorers such as WhatsOnChain and Bitails index this pattern

References: genesis-spec.md, BSV Skills Center.

## Fee Rate

Default miner policy: **100 satoshis per kilobyte** of signed transaction size (as of 2025–2026).

- SAMIZDAT uses 100 sat/KB as the default; configurable per call
- Fee is estimated from the SIGNED byte size (not unsigned), because the change
  amount is computed before signing

## Transaction Binary Format

Standard Bitcoin/BSV serialization (no SegWit):

```
Version:         4 bytes, int32 LE (value 1)
Input count:     varint
Inputs:
  TXID:          32 bytes, REVERSED byte order
  Vout:          4 bytes, uint32 LE
  Script length: varint (0 = unsigned/empty)
  Script:        variable
  Sequence:      4 bytes, uint32 LE (0xffffffff)
Output count:    varint
Outputs:
  Satoshis:      8 bytes, int64 LE
  Script length: varint
  Script:        variable
Locktime:        4 bytes, uint32 LE (0)
```

TXID note: displayed hex is big-endian; in the raw tx bytes it is reversed.

## Varint Encoding

```
0x00–0xfc:  1 byte  (value as-is)
0xfd:       3 bytes  fd [u16 LE]
0xfe:       5 bytes  fe [u32 LE]
0xff:       9 bytes  ff [u64 LE]
```

## PUSHDATA Opcode Encoding (for script data elements)

Minimal encoding rules:

```
0 bytes:       OP_0    = 0x00
1–75 bytes:    [len]   [data]
76–255 bytes:  0x4c [len u8] [data]           OP_PUSHDATA1
256–65535:     0x4d [len u16 LE] [data]        OP_PUSHDATA2
65536+:        0x4e [len u32 LE] [data]        OP_PUSHDATA4
```

## P2PKH Locking Script

```
OP_DUP OP_HASH160 <20-byte-hash> OP_EQUALVERIFY OP_CHECKSIG
= 0x76 0xa9 0x14 [20 bytes] 0x88 0xac  (25 bytes total)
```

## Signed Input Size Estimate (P2PKH)

For fee computation, each P2PKH input contributes ~148 bytes when signed:
- txid: 32
- vout: 4
- script_len varint: 1 (for 107-byte script)
- unlocking script: 107 (1 + 71 DER sig + 1 + 33 compressed pubkey)
- sequence: 4

## P2PKH Output Size

34 bytes:
- satoshis: 8
- script_len varint: 1 (for 25-byte script)
- script: 25

## SAMIZDAT Protocol Marker

SAMIZDAT transactions are identified by the 4-byte ASCII marker `SMZD`
(`0x53 0x4d 0x5a 0x44`) at the start of the embedded blob.
The next byte identifies the record type: `0x01` = chunk, `0x02` = anchor.

## Chunk Transaction Payload Structure

Blob embedded in the data-carrier output:

```
[4]     "SMZD"           protocol marker
[1]     0x01             TYPE_CHUNK
[1]     0x01             version
[4 LE]  chunk_index
[4 LE]  data_length
[n]     chunk_data       (≤ 100 KB default target)
```

## Anchor Transaction Payload Structure

```
[4]     "SMZD"           protocol marker
[1]     0x02             TYPE_ANCHOR
[1]     0x01             version
[32]    manifest_hash    SHA-256(stableJSON(manifest))
[32]    root_hash        Merkle root
[4 LE]  chunk_txids_len
[n]     chunk_txids      JSON UTF-8 array of hex txid strings, in chunk order
[4 LE]  manifest_len
[m]     manifest_json    full manifest object (stable key order)
```

Both chunk_txids and manifest_json use stable JSON (alphabetically sorted keys) for deterministic
serialisation and hash verification.
