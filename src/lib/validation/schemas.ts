/**
 * Zod Validation Schemas
 * Comprehensive validation schemas for OTC application data
 */

import { z } from 'zod';

/**
 * Common validation patterns
 */
export const ValidationPatterns = {
  // Cardano addresses
  CARDANO_ADDRESS: /^addr1[a-z0-9]{1,100}$/,
  BYRON_ADDRESS: /^[A-Za-z0-9]{50,120}$/,
  
  // Cardano hashes
  TX_HASH: /^[a-f0-9]{64}$/,
  UTXO_ID: /^[a-f0-9]{64}#[0-9]+$/,
  
  // ADA amounts (lovelace)
  LOVELACE_AMOUNT: /^[0-9]+$/,
  
  // Request IDs
  REQUEST_ID: /^req_[A-Za-z0-9_-]{20,50}$/,
  
  // Session/JWT tokens
  JWT_TOKEN: /^[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+$/,
  
  // Email
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  
  // IP addresses
  IP_ADDRESS: /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/,
  
  // Wallet names
  WALLET_NAME: /^[a-zA-Z0-9_-]{2,20}$/,
} as const;

/**
 * Custom Zod refinements
 */
export const CustomValidations = {
  // ADA amount validation (in lovelace)
  lovelaceAmount: (value: string) => {
    const num = BigInt(value);
    return num > 0n && num <= BigInt('45000000000000000'); // Max ADA supply
  },

  // ADA amount in human format (decimal)
  adaAmount: (value: number) => {
    return value > 0 && value <= 45000000000 && Number.isFinite(value);
  },

  // Cardano address validation
  cardanoAddress: (address: string) => {
    return ValidationPatterns.CARDANO_ADDRESS.test(address) || 
           ValidationPatterns.BYRON_ADDRESS.test(address);
  },

  // Future timestamp validation
  futureTimestamp: (timestamp: number) => {
    return timestamp > Date.now();
  },

  // Past timestamp validation
  pastTimestamp: (timestamp: number) => {
    return timestamp < Date.now();
  },

  // Rate validation (0.01 to 1000000)
  exchangeRate: (rate: number) => {
    return rate >= 0.01 && rate <= 1000000 && Number.isFinite(rate);
  }
};

/**
 * Base schemas
 */
export const BaseSchemas = {
  // Pagination
  pagination: z.object({
    page: z.number().int().min(1).default(1),
    limit: z.number().int().min(1).max(100).default(20),
    sortBy: z.string().optional(),
    sortOrder: z.enum(['asc', 'desc']).default('desc')
  }),

  // Timestamps
  timestamp: z.number().int().positive(),
  
  // IDs
  id: z.string().min(1).max(100),
  requestId: z.string().regex(ValidationPatterns.REQUEST_ID, 'Invalid request ID format'),
  
  // Amounts
  lovelaceAmount: z.string()
    .regex(ValidationPatterns.LOVELACE_AMOUNT, 'Invalid lovelace amount')
    .refine(CustomValidations.lovelaceAmount, 'Amount out of valid range'),
    
  adaAmount: z.number().refine(CustomValidations.adaAmount, 'Invalid ADA amount'),
  
  // Addresses
  cardanoAddress: z.string()
    .min(10)
    .max(120)
    .refine(CustomValidations.cardanoAddress, 'Invalid Cardano address'),
    
  // Crypto hashes
  txHash: z.string().regex(ValidationPatterns.TX_HASH, 'Invalid transaction hash'),
  
  // Network
  ipAddress: z.string().regex(ValidationPatterns.IP_ADDRESS, 'Invalid IP address'),
  
  // Email
  email: z.string().regex(ValidationPatterns.EMAIL, 'Invalid email format'),
  
  // Wallet
  walletName: z.string().regex(ValidationPatterns.WALLET_NAME, 'Invalid wallet name'),
  
  // Optional fields
  optionalString: z.string().optional().or(z.literal('')).transform(val => val || undefined),
  optionalNumber: z.number().optional().or(z.nan()).transform(val => isNaN(val as number) ? undefined : val)
};

/**
 * OTC Request schemas
 */
export const OTCRequestSchemas = {
  // Transfer modes
  transferMode: z.enum(['fixed_amount', 'sweep', 'rate_based']),
  
  // Request status
  requestStatus: z.enum([
    'created', 'pending_payment', 'presigned', 'ready_to_submit', 
    'submitted', 'confirmed', 'failed', 'expired', 'cancelled'
  ]),

  // Create request payload
  createRequest: z.object({
    mode: z.literal('fixed_amount'),
    amount: BaseSchemas.lovelaceAmount,
    destination: BaseSchemas.cardanoAddress,
    memo: z.string().max(500).optional(),
    ttl_minutes: z.number().int().min(5).max(1440).default(30),
    require_memo: z.boolean().default(false)
  }).or(z.object({
    mode: z.literal('sweep'),
    destination: BaseSchemas.cardanoAddress,
    memo: z.string().max(500).optional(),
    ttl_minutes: z.number().int().min(5).max(1440).default(30),
    require_memo: z.boolean().default(false)
  })).or(z.object({
    mode: z.literal('rate_based'),
    target_currency: z.string().length(3), // USD, EUR, etc.
    target_amount: z.number().positive(),
    rate_source: z.string().min(1).max(50),
    destination: BaseSchemas.cardanoAddress,
    memo: z.string().max(500).optional(),
    ttl_minutes: z.number().int().min(5).max(1440).default(30),
    require_memo: z.boolean().default(false)
  })),

  // Request update
  updateRequest: z.object({
    status: z.enum(['cancelled', 'expired']).optional(),
    memo: z.string().max(500).optional(),
    ttl_minutes: z.number().int().min(5).max(1440).optional()
  }),

  // Request query filters
  requestQuery: z.object({
    status: z.array(z.enum([
      'created', 'pending_payment', 'presigned', 'ready_to_submit',
      'submitted', 'confirmed', 'failed', 'expired', 'cancelled'
    ])).optional(),
    mode: z.array(z.enum(['fixed_amount', 'sweep', 'rate_based'])).optional(),
    created_after: BaseSchemas.timestamp.optional(),
    created_before: BaseSchemas.timestamp.optional(),
    amount_min: BaseSchemas.lovelaceAmount.optional(),
    amount_max: BaseSchemas.lovelaceAmount.optional(),
    destination: BaseSchemas.cardanoAddress.optional(),
    search: z.string().max(100).optional()
  }).merge(BaseSchemas.pagination),

  // Full request object
  request: z.object({
    id: BaseSchemas.requestId,
    mode: z.enum(['fixed_amount', 'sweep', 'rate_based']),
    status: z.enum([
      'created', 'pending_payment', 'presigned', 'ready_to_submit',
      'submitted', 'confirmed', 'failed', 'expired', 'cancelled'
    ]),
    amount: BaseSchemas.lovelaceAmount.optional(),
    destination: BaseSchemas.cardanoAddress,
    memo: z.string().max(500).optional(),
    ttl_minutes: z.number().int().positive(),
    expires_at: BaseSchemas.timestamp,
    created_at: BaseSchemas.timestamp,
    updated_at: BaseSchemas.timestamp,
    
    // Rate-based specific
    target_currency: z.string().length(3).optional(),
    target_amount: z.number().positive().optional(),
    exchange_rate: z.number().positive().optional(),
    rate_source: z.string().max(50).optional(),
    
    // Metadata
    qr_code_url: z.string().url().optional(),
    signing_url: z.string().url(),
    
    // Transaction data
    tx_hash: BaseSchemas.txHash.optional(),
    confirmed_at: BaseSchemas.timestamp.optional(),
    confirmation_count: z.number().int().min(0).optional(),
    
    // Error information
    error_message: z.string().max(1000).optional(),
    retry_count: z.number().int().min(0).default(0)
  })
};

/**
 * Transaction schemas
 */
export const TransactionSchemas = {
  // UTxO
  utxo: z.object({
    txHash: BaseSchemas.txHash,
    outputIndex: z.number().int().min(0),
    amount: BaseSchemas.lovelaceAmount,
    address: BaseSchemas.cardanoAddress,
    assets: z.array(z.object({
      unit: z.string().min(1),
      quantity: z.string().regex(/^[0-9]+$/)
    })).default([])
  }),

  // Transaction input
  txInput: z.object({
    txHash: BaseSchemas.txHash,
    outputIndex: z.number().int().min(0),
    amount: BaseSchemas.lovelaceAmount,
    address: BaseSchemas.cardanoAddress
  }),

  // Transaction output
  txOutput: z.object({
    address: BaseSchemas.cardanoAddress,
    amount: BaseSchemas.lovelaceAmount,
    assets: z.array(z.object({
      unit: z.string().min(1),
      quantity: z.string().regex(/^[0-9]+$/)
    })).default([])
  }),

  // Transaction preview
  txPreview: z.object({
    inputs: z.array(z.object({
      txHash: BaseSchemas.txHash,
      outputIndex: z.number().int().min(0),
      amount: BaseSchemas.lovelaceAmount,
      address: BaseSchemas.cardanoAddress
    })),
    outputs: z.array(z.object({
      address: BaseSchemas.cardanoAddress,
      amount: BaseSchemas.lovelaceAmount,
      assets: z.array(z.object({
        unit: z.string().min(1),
        quantity: z.string().regex(/^[0-9]+$/)
      })).default([])
    })),
    fee: BaseSchemas.lovelaceAmount,
    totalInput: BaseSchemas.lovelaceAmount,
    totalOutput: BaseSchemas.lovelaceAmount,
    changeAmount: BaseSchemas.lovelaceAmount.optional(),
    ttl: z.number().int().positive().optional(),
    validityStart: z.number().int().min(0).optional()
  }),

  // Signed transaction
  signedTx: z.object({
    txBody: z.string().min(1), // CBOR hex
    witnesses: z.object({
      vkeyWitnesses: z.array(z.object({
        vkey: z.string().min(1),
        signature: z.string().min(1)
      })).optional(),
      nativeScripts: z.array(z.string()).optional(),
      bootstrapWitnesses: z.array(z.object({
        publicKey: z.string().min(1),
        signature: z.string().min(1),
        chainCode: z.string().min(1),
        attributes: z.string().min(1)
      })).optional()
    }),
    auxiliaryData: z.string().optional(), // CBOR hex
    isValid: z.boolean().default(true)
  }),

  // Transaction submission
  submitTx: z.object({
    txHash: BaseSchemas.txHash,
    txBody: z.string().min(1),
    witnesses: z.string().min(1),
    metadata: z.string().optional()
  }),

  // Presigned transaction data
  presignedTx: z.object({
    requestId: BaseSchemas.requestId,
    txBody: z.string().min(1), // CBOR hex
    witness: z.string().min(1), // CBOR hex
    metadata: z.object({
      inputs_used: z.array(z.string()),
      wallet_used: BaseSchemas.walletName,
      signed_at: BaseSchemas.timestamp,
      expires_at: BaseSchemas.timestamp
    }),
    integrity_hash: z.string().min(1)
  })
};

/**
 * Wallet schemas
 */
export const WalletSchemas = {
  // Wallet info
  walletInfo: z.object({
    name: BaseSchemas.walletName,
    icon: z.string().url(),
    version: z.string().min(1),
    isEnabled: z.boolean(),
    isConnected: z.boolean()
  }),

  // Balance
  balance: z.object({
    ada: BaseSchemas.lovelaceAmount,
    assets: z.array(z.object({
      unit: z.string().min(1),
      quantity: z.string().regex(/^[0-9]+$/),
      fingerprint: z.string().optional(),
      metadata: z.object({
        name: z.string().optional(),
        description: z.string().optional(),
        ticker: z.string().optional(),
        decimals: z.number().int().min(0).max(18).optional()
      }).optional()
    })).default([])
  }),

  // Address
  address: z.object({
    address: BaseSchemas.cardanoAddress,
    isUsed: z.boolean().default(false),
    derivationPath: z.string().optional()
  }),

  // Collateral UTxO
  collateral: z.object({
    txHash: BaseSchemas.txHash,
    outputIndex: z.number().int().min(0),
    amount: BaseSchemas.lovelaceAmount
  })
};

/**
 * Admin schemas
 */
export const AdminSchemas = {
  // Login
  adminLogin: z.object({
    username: z.string().min(3).max(50),
    password: z.string().min(8).max(100),
    rememberMe: z.boolean().default(false)
  }),

  // Change password
  changePassword: z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string()
      .min(8, 'Password must be at least 8 characters')
      .max(100, 'Password must be less than 100 characters')
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
      .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
      .regex(/[0-9]/, 'Password must contain at least one number')
      .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
    confirmPassword: z.string().min(1)
  }).refine(data => data.newPassword === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"]
  }),

  // System settings
  systemSettings: z.object({
    maintenance_mode: z.boolean().default(false),
    max_requests_per_hour: z.number().int().min(1).max(10000).default(100),
    default_ttl_minutes: z.number().int().min(5).max(1440).default(30),
    enable_rate_based_mode: z.boolean().default(true),
    max_ada_amount: BaseSchemas.adaAmount.default(10000),
    min_ada_amount: BaseSchemas.adaAmount.default(1),
    
    // Security settings
    session_timeout_minutes: z.number().int().min(5).max(480).default(60),
    max_login_attempts: z.number().int().min(3).max(10).default(5),
    enable_audit_logging: z.boolean().default(true),
    
    // Network settings
    blockfrost_api_key: z.string().min(1).max(200),
    network: z.enum(['mainnet', 'testnet']).default('mainnet'),
    
    // Rate source settings
    default_rate_source: z.string().min(1).max(50).default('coinmarketcap'),
    rate_cache_minutes: z.number().int().min(1).max(60).default(5)
  }),

  // Audit log query
  auditLogQuery: z.object({
    level: z.array(z.enum(['debug', 'info', 'warn', 'error', 'critical'])).optional(),
    category: z.array(z.enum([
      'auth', 'request', 'transaction', 'wallet', 'system', 'security'
    ])).optional(),
    user_id: z.string().optional(),
    ip_address: BaseSchemas.ipAddress.optional(),
    after: BaseSchemas.timestamp.optional(),
    before: BaseSchemas.timestamp.optional(),
    search: z.string().max(200).optional()
  }).merge(BaseSchemas.pagination)
};

/**
 * API Response schemas
 */
export const APIResponseSchemas = {
  // Success response
  success: <T extends z.ZodType>(dataSchema: T) => z.object({
    success: z.literal(true),
    data: dataSchema,
    message: z.string().optional(),
    timestamp: BaseSchemas.timestamp
  }),

  // Error response
  error: z.object({
    success: z.literal(false),
    error: z.object({
      code: z.string().min(1),
      message: z.string().min(1),
      details: z.record(z.any()).optional(),
      stack: z.string().optional() // Only in development
    }),
    timestamp: BaseSchemas.timestamp
  }),

  // Pagination response
  paginated: <T extends z.ZodType>(itemSchema: T) => z.object({
    success: z.literal(true),
    data: z.object({
      items: z.array(itemSchema),
      pagination: z.object({
        page: z.number().int().min(1),
        limit: z.number().int().min(1),
        total: z.number().int().min(0),
        pages: z.number().int().min(0),
        hasNext: z.boolean(),
        hasPrevious: z.boolean()
      })
    }),
    timestamp: BaseSchemas.timestamp
  })
};

/**
 * Form validation schemas
 */
export const FormSchemas = {
  // Contact form
  contact: z.object({
    name: z.string().min(2).max(100),
    email: BaseSchemas.email,
    subject: z.string().min(5).max(200),
    message: z.string().min(10).max(2000)
  }),

  // Settings form
  userSettings: z.object({
    notifications: z.object({
      email: z.boolean().default(true),
      browser: z.boolean().default(true),
      webhook_url: z.string().url().optional()
    }),
    preferences: z.object({
      theme: z.enum(['light', 'dark', 'auto']).default('auto'),
      currency: z.string().length(3).default('USD'),
      language: z.enum(['en', 'ja']).default('en')
    })
  }),

  // Rate configuration
  rateConfig: z.object({
    source: z.enum(['coinmarketcap', 'coingecko', 'binance', 'kraken']),
    api_key: z.string().min(1).max(200).optional(),
    cache_minutes: z.number().int().min(1).max(60).default(5),
    fallback_rate: z.number().positive().optional(),
    markup_percentage: z.number().min(0).max(50).default(0)
  })
};

/**
 * WebSocket message schemas
 */
export const WebSocketSchemas = {
  // Incoming message
  message: z.object({
    type: z.enum([
      'subscribe', 'unsubscribe', 'ping', 'request_update', 
      'transaction_update', 'system_status'
    ]),
    payload: z.record(z.any()).optional(),
    requestId: z.string().optional(),
    timestamp: BaseSchemas.timestamp
  }),

  // Outgoing notification
  notification: z.object({
    type: z.enum([
      'request_created', 'request_updated', 'transaction_signed',
      'transaction_submitted', 'transaction_confirmed', 'system_alert'
    ]),
    payload: z.record(z.any()),
    timestamp: BaseSchemas.timestamp
  })
};

/**
 * Export all schemas as a single object for easy imports
 */
export const ValidationSchemas = {
  Base: BaseSchemas,
  OTCRequest: OTCRequestSchemas,
  Transaction: TransactionSchemas,
  Wallet: WalletSchemas,
  Admin: AdminSchemas,
  APIResponse: APIResponseSchemas,
  Form: FormSchemas,
  WebSocket: WebSocketSchemas
} as const;

/**
 * Type inference helpers
 */
export type OTCRequest = z.infer<typeof OTCRequestSchemas.request>;
export type CreateRequestPayload = z.infer<typeof OTCRequestSchemas.createRequest>;
export type TransactionPreview = z.infer<typeof TransactionSchemas.txPreview>;
export type SignedTransaction = z.infer<typeof TransactionSchemas.signedTx>;
export type WalletInfo = z.infer<typeof WalletSchemas.walletInfo>;
export type AdminLogin = z.infer<typeof AdminSchemas.adminLogin>;
export type SystemSettings = z.infer<typeof AdminSchemas.systemSettings>;
export type APISuccessResponse<T> = z.infer<ReturnType<typeof APIResponseSchemas.success<z.ZodType<T>>>>;
export type APIErrorResponse = z.infer<typeof APIResponseSchemas.error>;

/**
 * Validation error formatting
 */
export const formatValidationErrors = (error: z.ZodError): Record<string, string[]> => {
  const formattedErrors: Record<string, string[]> = {};
  
  error.errors.forEach((err) => {
    const path = err.path.join('.');
    if (!formattedErrors[path]) {
      formattedErrors[path] = [];
    }
    formattedErrors[path].push(err.message);
  });
  
  return formattedErrors;
};

/**
 * Safe validation helper
 */
export const safeValidate = <T>(
  schema: z.ZodSchema<T>, 
  data: unknown
): { success: true; data: T } | { success: false; errors: Record<string, string[]> } => {
  const result = schema.safeParse(data);
  
  if (result.success) {
    return { success: true, data: result.data };
  } else {
    return { success: false, errors: formatValidationErrors(result.error) };
  }
};