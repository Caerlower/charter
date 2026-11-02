// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {MandateVault} from "../src/MandateVault.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

/// @notice Deploy MandateVault. Set TOKEN, or DEPLOY_MOCK_USDC=true, or use known chain defaults.
contract Deploy is Script {
    address constant HSK_MAINNET_USDC = 0x054ed45810DbBAb8B27668922D110669c9D88D0a;
    address constant HSK_TESTNET_USDC = 0x8FE3cB719Ee4410E236Cd6b72ab1fCDC06eF53c6;
    /// Circle official USDC on Ethereum Sepolia
    address constant ETH_SEPOLIA_USDC = 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238;

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address token = vm.envOr("TOKEN", address(0));
        bool deployMock = vm.envOr("DEPLOY_MOCK_USDC", false);

        vm.startBroadcast(pk);

        if (token == address(0)) {
            if (deployMock) {
                MockUSDC mock = new MockUSDC();
                mock.mint(deployer, 1_000_000e6);
                token = address(mock);
                console2.log("MockUSDC", token);
            } else {
                uint256 chainId = block.chainid;
                if (chainId == 177) token = HSK_MAINNET_USDC;
                else if (chainId == 133) token = HSK_TESTNET_USDC;
                else if (chainId == 11155111) token = ETH_SEPOLIA_USDC;
                else revert("Set TOKEN or DEPLOY_MOCK_USDC=true");
            }
        }

        MandateVault vault = new MandateVault(token, deployer);
        console2.log("MandateVault", address(vault));
        console2.log("Token", token);
        console2.log("Owner", deployer);
        console2.log("ChainId", block.chainid);

        vm.stopBroadcast();
    }
}
