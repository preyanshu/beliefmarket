import { BITE } from "@skalenetwork/bite";
import { BITE_RPC_URL } from "@/config/chains";
import { encodeAbiParameters, parseAbiParameters } from "viem";

/**
 * Encrypt an order using BITE v2 threshold encryption.
 * Payload: (uint256 price, uint256 amount)
 *
 * Price is in PRICE_PRECISION units (6 decimals).
 * Amount is in base token units (18 decimals).
 */
export async function encryptOrder(
  price: bigint,
  amount: bigint
): Promise<string> {
  const bite = new BITE(BITE_RPC_URL);

  const encoded = encodeAbiParameters(
    parseAbiParameters("uint256, uint256"),
    [price, amount]
  );

  const encrypted = await bite.encryptMessage(encoded);
  return encrypted;
}
