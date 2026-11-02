// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {MandateVault} from "../src/MandateVault.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

/// @notice Deploy MandateVault. Set TOKEN env for existing USDC, or leave empty to deploy MockUSDC.
contract Deploy is Script {
    // HSK Chain mainnet bridged USDC
    address constant HSK_MAINNET_USDC = 0x054ed45810DbBAb8B27668922D110669c9D88D0a;
    // HSK Chain testnet USDC (HSP QA)
    address constant HSK_TESTNET_USDC = 0x8FE3cB719Ee4410E236Cd6b72ab1fCDC06eF53c6;

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
                else revert("Set TOKEN or DEPLOY_MOCK_USDC=true");
            }
        }

        MandateVault vault = new MandateVault(token, deployer);
        console2.log("MandateVault", address(vault));
        console2.log("Token", token);
        console2.log("Owner", deployer);

        vm.stopBroadcast();
    }
}
