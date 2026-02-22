// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ISwapRouter
/// @notice Minimal interface for DEX swap routers (Uniswap V3 + Aerodrome compatible)
interface ISwapRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    /// @notice Swap exact input tokens for as many output tokens as possible (Uniswap V3)
    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}

/// @title IAerodromeRouter
/// @notice Minimal interface for Aerodrome (Base native DEX) router
interface IAerodromeRouter {
    struct Route {
        address from;
        address to;
        bool stable;
        address factory;
    }

    /// @notice Swap exact tokens for tokens via route
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        Route[] calldata routes,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);

    /// @notice Get amounts out for a route
    function getAmountsOut(uint256 amountIn, Route[] calldata routes)
        external
        view
        returns (uint256[] memory amounts);
}
