// Watcher constants - mirrored from frontend/js/constants.js for TypeScript

export const REGISTRY_ABI = [
  {
    type: 'function',
    name: 'isRegistered',
    inputs: [{ name: 'name', type: 'string' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'isAuthorized',
    inputs: [
      { name: 'name', type: 'string' },
      { name: 'tokenContract', type: 'address' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getProjectInfo',
    inputs: [{ name: 'name', type: 'string' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'founder', type: 'address' },
          { name: 'additionalAddresses', type: 'address[]' },
          { name: 'shieldContract', type: 'address' },
          { name: 'verificationProofs', type: 'bytes32[]' },
          { name: 'registeredAt', type: 'uint256' },
          { name: 'challengeDeadline', type: 'uint256' },
          { name: 'exists', type: 'bool' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'reportUnauthorizedToken',
    inputs: [
      { name: 'name', type: 'string' },
      { name: 'tokenContract', type: 'address' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'event',
    name: 'ProjectRegistered',
    inputs: [
      { name: 'nameHash', type: 'bytes32', indexed: true },
      { name: 'name', type: 'string', indexed: false },
      { name: 'founder', type: 'address', indexed: true },
      { name: 'challengeDeadline', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'UnauthorizedTokenReported',
    inputs: [
      { name: 'nameHash', type: 'bytes32', indexed: true },
      { name: 'name', type: 'string', indexed: false },
      { name: 'tokenContract', type: 'address', indexed: true },
      { name: 'reporter', type: 'address', indexed: true },
    ],
  },
] as const;

export const ERC20_ABI = [
  {
    type: 'function',
    name: 'name',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'symbol',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'decimals',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'totalSupply',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const;

export const UNISWAP_V2_FACTORY_ABI = [
  {
    type: 'event',
    name: 'PairCreated',
    inputs: [
      { name: 'token0', type: 'address', indexed: true },
      { name: 'token1', type: 'address', indexed: true },
      { name: 'pair', type: 'address', indexed: false },
      { name: '', type: 'uint256', indexed: false },
    ],
  },
] as const;

export const UNISWAP_V3_FACTORY_ABI = [
  {
    type: 'event',
    name: 'PoolCreated',
    inputs: [
      { name: 'token0', type: 'address', indexed: true },
      { name: 'token1', type: 'address', indexed: true },
      { name: 'fee', type: 'uint24', indexed: true },
      { name: 'tickSpacing', type: 'int24', indexed: false },
      { name: 'pool', type: 'address', indexed: false },
    ],
  },
] as const;

// Base Mainnet addresses
export const BASE_MAINNET = {
  chainId: 8453,
  rpcUrl: process.env['BASE_RPC_URL'] ?? 'https://mainnet.base.org',
  weth: '0x4200000000000000000000000000000000000006' as `0x${string}`,
  uniswapV3Factory: '0x33128a8fC17869897dcE68Ed026d694621f6FDfD' as `0x${string}`,
  aerodromeFactory: '0x420DD381b31aEf6683db6B902084cB0FFECe40D' as `0x${string}`,
  registryAddress: (process.env['REGISTRY_ADDRESS'] ?? 'TBD') as `0x${string}`,
};

// Base Sepolia addresses
export const BASE_SEPOLIA = {
  chainId: 84532,
  rpcUrl: process.env['BASE_SEPOLIA_RPC_URL'] ?? 'https://sepolia.base.org',
  weth: '0x4200000000000000000000000000000000000006' as `0x${string}`,
  uniswapV3Factory: '0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24' as `0x${string}`,
  aerodromeFactory: '0x' as `0x${string}`, // Not available on Sepolia
  registryAddress: (process.env['REGISTRY_ADDRESS'] ?? 'TBD') as `0x${string}`,
};
