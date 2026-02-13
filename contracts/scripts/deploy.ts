import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  console.log("Balance:", (await ethers.provider.getBalance(deployer.address)).toString());

  // Deploy DarkToken
  console.log("\nDeploying DarkToken...");
  const DarkToken = await ethers.getContractFactory("DarkToken");
  const darkToken = await DarkToken.deploy();
  await darkToken.waitForDeployment();
  const darkTokenAddress = await darkToken.getAddress();
  console.log("DarkToken deployed at:", darkTokenAddress);

  // USDC on BITE V2 Sandbox
  const USDC_ADDRESS = "0xc4083B1E81ceb461Ccef3FDa8A9F24F0d764B6D8";

  // Deploy ShadowPool
  console.log("\nDeploying ShadowPool...");
  const ShadowPool = await ethers.getContractFactory("ShadowPool");
  const shadowPool = await ShadowPool.deploy(darkTokenAddress, USDC_ADDRESS);
  await shadowPool.waitForDeployment();
  const shadowPoolAddress = await shadowPool.getAddress();
  console.log("ShadowPool deployed at:", shadowPoolAddress);

  console.log("\n=== DEPLOYMENT SUCCESSFUL ===");
  console.log("Network:", (await ethers.provider.getNetwork()).chainId.toString());
  console.log("\n=== UPDATE FRONTEND ===");
  console.log(`DARK_TOKEN_ADDRESS = "${darkTokenAddress}"`);
  console.log(`SHADOW_POOL_ADDRESS = "${shadowPoolAddress}"`);
  console.log(`USDC_ADDRESS = "${USDC_ADDRESS}"`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
