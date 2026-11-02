// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MandateVault} from "../src/MandateVault.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

contract MandateVaultTest is Test {
    MockUSDC usdc;
    MandateVault vault;

    address owner = address(0xA11CE);
    address operator = address(0xB0B);
    address agent = address(0xA6E17);
    address merchant = address(0x5E11E2);
    address stranger = address(0xBAD);

    function setUp() public {
        usdc = new MockUSDC();
        vm.prank(owner);
        // constructor sets owner; deploy from owner context via vm.prank on new? constructor msg.sender is this test.
        // Deploy then transfer? Our constructor takes owner_ explicitly.
        vault = new MandateVault(address(usdc), owner);

        vm.prank(owner);
        vault.setOperator(operator, true);

        usdc.mint(owner, 1_000_000e6);
        vm.startPrank(owner);
        usdc.approve(address(vault), type(uint256).max);
        vault.fund(agent, 100e6);
        vault.setPolicy(agent, 20e6, 50e6, 200e6, uint64(block.timestamp + 30 days), false);
        vault.setMerchantAllowed(agent, merchant, true);
        vm.stopPrank();
    }

    function test_authorize_success() public {
        bytes32 mandateId = keccak256("m1");
        vm.prank(operator);
        uint128 remaining = vault.authorize(agent, merchant, 10e6, mandateId);
        assertEq(remaining, 90e6);

        (bool ok,) = vault.checkAuthorization(agent, merchant, 10e6);
        assertTrue(ok);
    }

    function test_block_merchant_not_allowed() public {
        vm.prank(operator);
        vm.expectRevert(MandateVault.MerchantNotAllowed.selector);
        vault.authorize(agent, stranger, 1e6, keccak256("m2"));
    }

    function test_block_exceeds_daily_cap() public {
        vm.startPrank(operator);
        vault.authorize(agent, merchant, 20e6, keccak256("d1"));
        vault.authorize(agent, merchant, 20e6, keccak256("d2"));
        vm.expectRevert(MandateVault.ExceedsDailyCap.selector);
        vault.authorize(agent, merchant, 20e6, keccak256("d3"));
        vm.stopPrank();
    }

    function test_block_max_per_payment() public {
        vm.prank(operator);
        vm.expectRevert(MandateVault.ExceedsMaxPerPayment.selector);
        vault.authorize(agent, merchant, 25e6, keccak256("big"));
    }

    function test_record_settlement() public {
        bytes32 mandateId = keccak256("m3");
        vm.prank(operator);
        vault.authorize(agent, merchant, 5e6, mandateId);

        vm.prank(operator);
        uint256 id = vault.recordSettlement(
            agent, merchant, 5e6, mandateId, keccak256("payref"), keccak256("tx")
        );
        MandateVault.Receipt memory r = vault.getReceipt(id);
        assertEq(r.agent, agent);
        assertEq(r.amount, 5e6);
        assertEq(vault.receiptCount(), 1);
    }

    function test_nl_style_freeze_blocks() public {
        vm.prank(owner);
        vault.setPolicy(agent, 20e6, 50e6, 200e6, uint64(block.timestamp + 30 days), true);

        vm.prank(operator);
        vm.expectRevert(MandateVault.AgentFrozen.selector);
        vault.authorize(agent, merchant, 1e6, keccak256("frozen"));
    }

    function test_credit_demo_path() public {
        address agent2 = address(0x2222);
        vm.startPrank(owner);
        vault.credit(agent2, 40e6);
        vault.setPolicy(agent2, 10e6, 40e6, 40e6, 0, false);
        vault.setMerchantAllowed(agent2, merchant, true);
        vm.stopPrank();

        vm.prank(operator);
        uint128 rem = vault.authorize(agent2, merchant, 10e6, keccak256("c1"));
        assertEq(rem, 30e6);
    }
}
