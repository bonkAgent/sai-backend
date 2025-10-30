// src/swagger.ts
import swaggerJSDoc from "swagger-jsdoc";

const openapiDefinition = {
  openapi: "3.0.3",
  info: {
    title: "Solana Agent API",
    version: "1.0.0",
    description: "Документация REST/SSE API вашего Solana Agent Chat Server",
  },
  servers: [
    {
      url: "http://localhost:{port}",
      description: "Local",
      variables: { port: { default: "3000" } },
    },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
      },
    },
    schemas: {
      ErrorResponse: {
        type: "object",
        properties: { error: { type: "string" } },
      },

      // ====== /api/chat (SSE) ======
      ToolEvent: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["tool"] },
          tool: { type: "object", additionalProperties: true },
        },
        required: ["type", "tool"],
      },
      ChatDelta: {
        type: "object",
        properties: {
          content: { type: "string" },
          isComplete: { type: "boolean" },
        },
        required: ["content", "isComplete"],
      },
      ChatCompletionEvent: {
        type: "object",
        properties: {
          content: { type: "string" },
          isComplete: { type: "boolean" },
          fullContent: { type: "string" },
        },
        required: ["content", "isComplete"],
      },

        BalanceResponse: {
            type: "object",
            additionalProperties: false,
            required: ["phantomBalance", "kaelusBalance"],
            properties: {
                phantomBalance: {
                    type: "string",
                    description: "Balance of Phantom wallet in SOL (string)",
                    example: "0.03451045",
                },
                kaelusBalance: { $ref: "#/components/schemas/KaelusBalance" }
            },
        },

        KaelusBalance: {
            type: "object",
            additionalProperties: false,
            required: ["breakdown"],
            properties: {
                breakdown: {
                    type: "array",
                    items: { $ref: "#/components/schemas/KaelusBalanceItem" }
                },
                totalUsd: {
                    type: "number",
                    format: "float",
                    description: "Total portfolio value in USD (optional for backward compatibility)",
                    example: 1523.77
                },
                tokens: {
                    type: "array",
                    items: { $ref: "#/components/schemas/KaelusTokenPosition" }
                }
            }
        },

        KaelusBalanceItem: {
            type: "object",
            additionalProperties: false,
            required: ["address", "balance"],
            properties: {
                symbol:  { type: "string", nullable: true, example: "SOL" },
                address: { type: "string", example: "So11111111111111111111111111111111111111112" },
                name:    { type: "string", nullable: true, example: "Solana" },
                logoURI: { type: "string", nullable: true, example: "https://…" },
                balance: { type: "number", format: "float", example: 1.23456789 },
                decimals:{ type: "integer", nullable: true, example: 9 }
            }
        },

        KaelusTokenPosition: {
            type: "object",
            additionalProperties: false,
            required: ["symbol", "address", "name", "balance", "valueUsd"],
            properties: {
                symbol: { type: "string", example: "SOL" },
                address: { type: "string", example: "So11111111111111111111111111111111111111112" },
                name: { type: "string", example: "Solana" },
                balance: { type: "number", format: "float", example: 1.23456789 },
                priceUsd: { type: "number", format: "float", nullable: true, example: 185.21 },
                valueUsd: { type: "number", format: "float", example: 228.64 },
                logoURI: { type: "string", nullable: true, example: "https://…" }
            }
        },

      // ====== /api/sidepanel/transfer ======
      TransferRequest: {
        type: "object",
        properties: {
          amount: { type: "number" },
          from: { type: "string", enum: ["kaelus", "phantom"] },
          publicKey: { type: "string" },
          priorityFee: { type: "number", default: 0 },
        },
        required: ["amount", "from", "publicKey"],
      },
      TransferResponseKaelus: {
        type: "object",
        properties: { status: { type: "string", enum: ["ok"] } },
        required: ["status"],
      },
      TransferResponsePhantom: {
        type: "object",
        properties: { publicKey: { type: "string" } },
        required: ["publicKey"],
      },

      // ====== /api/sidepanel/getFriends ======
      FriendsResponse: {
        type: "array",
        items: { type: "object", additionalProperties: true },
      },

      // ====== /api/market/trending ======
        TrendingItem: {
            type: "object",
            required: ["mint","name","symbol"],
            properties: {
             mint: { type: "string" },
             name: { type: "string" },
             symbol: { type: "string" },
             image: { type: "string" },
             change24h: { type: "number" },
             priceUsd: { type: "number" },
             marketCapUsd: { type: "number" }
            }
        },
        TrendingResponse: {
            type: "object",
            required: ["asOf", "items"],
            properties: {
             asOf: { type: "integer", format: "int64", description: "Unix ms" },
             items: { type: "array", items: { $ref: "#/components/schemas/TrendingItem" } }
            }
        },

      // ====== /api/activity ======
      ActivityItem: {
        type: "object",
        additionalProperties: true,
      },
      ActivityResponse: {
        type: "object",
        properties: {
          items: { type: "array", items: { $ref: "#/components/schemas/ActivityItem" } },
        },
        required: ["items"],
      },
    },
  },
  security: [{ BearerAuth: [] }],
};

export const swaggerSpec = swaggerJSDoc({
  definition: {
    openapi: "3.0.3",
    info: { title: "Solana Agent API", version: "1.0.0" },
    components: {
      securitySchemes: {
        BearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      },
      schemas: {
        // ========= SSE envelope =========
        // components.schemas{
  // ==== Общие ====
  ErrorResponse: {
    type: "object",
    properties: { error: { type: "string" } },
  },

  // ==== SSE ====
  SSEMessage: {
    oneOf: [
      { $ref: "#/components/schemas/DeltaChunk" },
      { $ref: "#/components/schemas/CompletionEvent" },
      { $ref: "#/components/schemas/ToolEvent" }
    ]
  },
  DeltaChunk: {
    type: "object",
    required: ["type", "content", "isComplete"],
    properties: {
      type: { type: "string", enum: ["delta"] },
      content: { type: "string" },
      isComplete: { type: "boolean" }
    }
  },
  CompletionEvent: {
    type: "object",
    required: ["type", "isComplete"],
    properties: {
      type: { type: "string", enum: ["completion"] },
      content: { type: "string" },
      isComplete: { type: "boolean", enum: [true] },
      fullContent: { type: "string" }
    }
  },

  // Новый формат: tool — это объект с полем toolName и остальными данными
  ToolEvent: {
    type: "object",
    required: ["type", "tool"],
    properties: {
      type: { type: "string", enum: ["tool"] },
      tool: {
        description: "Объект с данными инструмента, включая toolName",
        oneOf: [
          { $ref: "#/components/schemas/TransferTokensTool" },
          { $ref: "#/components/schemas/SwapTool" },
          { $ref: "#/components/schemas/GetTokenDataTool" },
          { $ref: "#/components/schemas/SwapLaunchpadFallbackTool" },
          { $ref: "#/components/schemas/ListStakingOptionsTool" },
          { $ref: "#/components/schemas/StakeMarinadeTool" },
          { $ref: "#/components/schemas/UnstakeMarinadeTool" },
          { $ref: "#/components/schemas/CreateTokenTool" },
          { $ref: "#/components/schemas/MeteoraGetPoolTool" },
          { $ref: "#/components/schemas/MeteoraAddLiquidityNewTool" },
          { $ref: "#/components/schemas/MeteoraAddLiquidityExistingTool" },
          { $ref: "#/components/schemas/MeteoraRemoveLiquidityTool" },
          { $ref: "#/components/schemas/KaminoDepositTool" },
          { $ref: "#/components/schemas/KaminoWithdrawTool" },
          { $ref: "#/components/schemas/KaminoBorrowTool" },
          { $ref: "#/components/schemas/KaminoRepayTool" },
          { $ref: "#/components/schemas/UnknownTool" }
        ]
      }
    }
  },

  // ==== Tool variants (каждая включает toolName) ====

  TransferTokensTool: {
    type: "object",
    required: ["toolName", "status", "transactionId", "to", "amount", "token"],
    properties: {
      toolName: { type: "string", enum: ["TRANSFER_TOKENS"] },
      status: { type: "string", enum: ["success"] },
      transactionId: { type: "string" },
      to: { type: "string" },
      amount: { type: "number" },
      token: {
        type: "object",
        properties: {
          symbol: { type: "string" },
          address: { type: "string" },
          logoURI: { type: "string" }
        }
      }
    }
  },

  GetTokenDataStatusResponse: {
    type: "object",
    required: ["birdeye", "solanaTracker", "creation", "creatorBalance", "security", "holderScan"],
    properties: {
      birdeye: { $ref: "#/components/schemas/BirdeyeTokenData" },
      solanaTracker: { $ref: "#/components/schemas/SolanaTrackerBundle" },
      creation: { $ref: "#/components/schemas/SolanaTrackerOverview" },
      creatorBalance: { $ref: "#/components/schemas/CreatorBalance" },
      security: { $ref: "#/components/schemas/SecurityReport" },
      holderScan: { $ref: "#/components/schemas/HolderScanBundle" }
    }
  },

  BirdeyeTokenData: {
    type: "object",
    required: ["address"],
    properties: {
      name: { type: "string", nullable: true },
      symbol: { type: "string", nullable: true },
      address: { type: "string" },
      logoURI: { type: "string", nullable: true },

      priceUsd: { type: "number", nullable: true },
      marketCap: { type: "number", nullable: true },
      fdv: { type: "number", nullable: true },
      liquidity: { type: "number", nullable: true },

      high24h: { type: "number", nullable: true },
      low24h: { type: "number", nullable: true },
      priceChange24hPercent: { type: "number", nullable: true },

      holderCount: { type: "number", nullable: true },
      totalSupply: { type: "number", nullable: true },
      circulatingSupply: { type: "number", nullable: true },
      numberMarkets: { type: "number", nullable: true },

      v1mUSD: { type: "number", nullable: true },
      vHistory1mUSD: { type: "number", nullable: true },
      v1mChangePercent: { type: "number", nullable: true },
      v5mUSD: { type: "number", nullable: true },
      vHistory5mUSD: { type: "number", nullable: true },
      v5mChangePercent: { type: "number", nullable: true },
      v30mUSD: { type: "number", nullable: true },
      vHistory30mUSD: { type: "number", nullable: true },
      v30mChangePercent: { type: "number", nullable: true },
      v24hUSD: { type: "number", nullable: true },
      vHistory24hUSD: { type: "number", nullable: true },
      v24hChangePercent: { type: "number", nullable: true },

      vBuy1mUSD: { type: "number", nullable: true },
      vSell1mUSD: { type: "number", nullable: true },
      vBuy5mUSD: { type: "number", nullable: true },
      vSell5mUSD: { type: "number", nullable: true },
      vBuy30mUSD: { type: "number", nullable: true },
      vSell30mUSD: { type: "number", nullable: true },
      vBuy24hUSD: { type: "number", nullable: true },
      vSell24hUSD: { type: "number", nullable: true },

      trade1m: { type: "number", nullable: true },
      buy1m: { type: "number", nullable: true },
      sell1m: { type: "number", nullable: true },
      trade5m: { type: "number", nullable: true },
      buy5m: { type: "number", nullable: true },
      sell5m: { type: "number", nullable: true },
      trade30m: { type: "number", nullable: true },
      buy30m: { type: "number", nullable: true },
      sell30m: { type: "number", nullable: true },
      trade24h: { type: "number", nullable: true },
      buy24h: { type: "number", nullable: true },
      sell24h: { type: "number", nullable: true },

      uniqueWallet1m: { type: "number", nullable: true },
      uniqueWallet5m: { type: "number", nullable: true },
      uniqueWallet30m: { type: "number", nullable: true },
      uniqueWallet24h: { type: "number", nullable: true },

      projectDescription: { type: "string", nullable: true },
      website: { type: "string", nullable: true },
      twitter: { type: "string", nullable: true },
      telegram: { type: "string", nullable: true },

      topHolders: {
        type: "array",
        nullable: true,
        items: {
          type: "object",
          properties: {
            address: { type: "string" },
            balance: { type: "number" }
          }
        }
      },

      tradingData: { type: "object", nullable: true, additionalProperties: true },

      platform: { type: "string", enum: ["solana"] }
    }
  },

  SolanaTrackerBundle: {
    type: "object",
    required: ["platform", "address"],
    properties: {
      platform: { type: "string", enum: ["solana"] },
      address: { type: "string" },
      ath: {
        type: "object",
        nullable: true,
        properties: { highest_market_cap: { type: "number", nullable: true } }
      },
      overview: { $ref: "#/components/schemas/SolanaTrackerOverview" },
      raw: { type: "object", nullable: true, additionalProperties: true }
    }
  },

  SolanaTrackerOverview: {
    type: "object",
    properties: {
      creator: { type: "string", nullable: true },
      created_tx: { type: "string", nullable: true },
      created_time: { type: "number", nullable: true },
      created_on: { type: "string", nullable: true }
    }
  },

  CreatorBalance: {
    type: "object",
    required: ["wallet"],
    properties: {
      wallet: { type: "string" },
      sol: {
        type: "object",
        nullable: true,
        properties: { lamports: { type: "number" }, balance: { type: "number" } }
      },
      token: {
        type: "object",
        nullable: true,
        properties: {
          mint: { type: "string" },
          uiAmount: { type: "number" },
          decimals: { type: "number", nullable: true },
          symbol: { type: "string", nullable: true },
          name: { type: "string", nullable: true },
          priceUsd: { type: "number", nullable: true },
          ataExists: { type: "boolean" },
          accountCount: { type: "number" },
          source: { type: "string", enum: ["birdeye", "rpc"] }
        }
      }
    }
  },

  SecurityReport: {
    type: "object",
    required: ["mint","riskScore","category","flags","liquidity","authorities","totals","sources"],
    properties: {
      mint: { type: "string" },
      riskScore: { type: "number" },
      category: {
        type: "string",
        enum: ["✅ Very Safe","⚠️ Low Risk","⚠️ Medium Risk","🚨 High Risk","🚨 Extreme Risk","Unknown"]
      },
      flags: { type: "array", items: { type: "object", additionalProperties: true } },
      liquidity: {
        type: "object",
        properties: {
          totalMarketLiquidity: { type: "number", nullable: true },
          totalStableLiquidity: { type: "number", nullable: true },
          totalLPProviders: { type: "number", nullable: true },
          stableRatio: { type: "number", nullable: true }
        }
      },
      authorities: {
        type: "object",
        properties: {
          mintAuthority: { type: "string", nullable: true },
          freezeAuthority: { type: "string", nullable: true }
        }
      },
      verification: { type: "object", nullable: true, additionalProperties: true },
      totals: {
        type: "object",
        properties: {
          totalHolders: { type: "number", nullable: true },
          price: { type: "number", nullable: true },
          votes: { type: "object", nullable: true, additionalProperties: true }
        }
      },
      snipers: { type: "object", nullable: true, additionalProperties: true },
      meta: { type: "object", nullable: true, additionalProperties: true },
      transferFee: { type: "object", nullable: true, additionalProperties: true },
      sources: {
        type: "object",
        properties: { rugcheck: { type: "boolean" }, solanaTracker: { type: "boolean" } }
      },
      risksRaw: { type: "array", nullable: true, items: { type: "object", additionalProperties: true } },
      originalScores: { type: "object", nullable: true, additionalProperties: true }
    }
  },

  HolderScanBundle: {
    type: "object",
    properties: {
      breakdowns: { type: "object", nullable: true, additionalProperties: true },
      statistics: { type: "object", nullable: true, additionalProperties: true },
      pnl: { type: "object", nullable: true, additionalProperties: true },
      walletCategories: { type: "object", nullable: true, additionalProperties: true },
      supplyBreakdown: { type: "object", nullable: true, additionalProperties: true }
    }
  },

  SwapTool: {
    type: "object",
    required: ["toolName", "status", "id", "amountFrom", "from", "amountTo", "to"],
    properties: {
      toolName: { type: "string", enum: ["SWAP"] },
      status: { type: "string", enum: ["success"] },
      id: { type: "string" },
      amountFrom: { type: "number" },
      from: {
        type: "object",
        properties: {
          symbol: { type: "string" },
          address: { type: "string" },
          logoURI: { type: "string" }
        }
      },
      amountTo: { type: "number" },
      to: {
        type: "object",
        properties: {
          symbol: { type: "string" },
          address: { type: "string" },
          logoURI: { type: "string" }
        }
      }
    }
  },

  GetTokenDataTool: {
    type: "object",
    required: [
      "toolName",
      "birdeye",
      "solanaTracker",
      "creation",
      "creatorBalance",
      "security",
      "holderScan"
    ],
    properties: {
      toolName: { type: "string", enum: ["GET_TOKEN_DATA"] },

      birdeye:        { $ref: "#/components/schemas/BirdeyeTokenData" },
      solanaTracker:  { $ref: "#/components/schemas/SolanaTrackerBundle" },
      creation:       { $ref: "#/components/schemas/SolanaTrackerOverview" },
      creatorBalance: { $ref: "#/components/schemas/CreatorBalance" },
      security:       { $ref: "#/components/schemas/SecurityReport" },
      holderScan:     { $ref: "#/components/schemas/HolderScanBundle" }
    },
  },

  SwapLaunchpadFallbackTool: {
    type: "object",
    required: ["toolName", "res"],
    properties: {
      toolName: { type: "string", enum: ["SWAP"] },
      res: { type: "object", additionalProperties: true }
    },
    description: "Формат при fallback-покупке на launchpad"
  },

  ListStakingOptionsTool: {
    type: "object",
    required: ["toolName", "text"],
    properties: {
      toolName: { type: "string", enum: ["LIST_STAKING_OPTIONS"] },
      text: { type: "string" }
    }
  },

  StakeMarinadeTool: {
    type: "object",
    required: ["toolName", "status", "transactionId", "details"],
    properties: {
      toolName: { type: "string", enum: ["STAKE"] },
      status: { type: "string", enum: ["success"] },
      transactionId: { type: "string" },
      details: { type: "string" }
    }
  },

  UnstakeMarinadeTool: {
    allOf: [{ $ref: "#/components/schemas/StakeMarinadeTool" }],
    description: "UNSTAKE/MARINADE возвращает те же поля, что и стейк (по коду)."
  },

  CreateTokenTool: {
    type: "object",
    required: [
      "toolName", "name", "symbol", "mint", "uri",
      "poolState", "baseVault", "quoteVault", "metadata"
    ],
    properties: {
      toolName: { type: "string", enum: ["CREATE_TOKEN"] },
      name: { type: "string" },
      symbol: { type: "string" },
      mint: { type: "string" },
      uri: { type: "string" },
      imageUrl: { type: "string" },
      poolState: { type: "string" },
      baseVault: { type: "string" },
      quoteVault: { type: "string" },
      metadata: { type: "string" }
    }
  },

  // <<=== Твой пример GET_METEORA_POOL
  MeteoraGetPoolTool: {
    type: "object",
    required: ["toolName", "data"],
    properties: {
      toolName: { type: "string", enum: ["GET_METEORA_POOL"] },
      data: {
        type: "object",
        required: [
          "address","name","reserve_x_amount","reserve_y_amount",
          "base_fee_percentage","max_fee_percentage","protocol_fee_percentage",
          "liquidity","fees_24h","today_fees","trade_volume_24h",
          "cumulative_trade_volume","cumulative_fee_volume",
          "current_price","apr","apy","fees","fee_tvl_ratio","volume"
        ],
        properties: {
          address: { type: "string" },
          name: { type: "string" },
          reserve_x_amount: { type: "integer" },
          reserve_y_amount: { type: "integer" },
          base_fee_percentage: { type: "string" },
          max_fee_percentage: { type: "string" },
          protocol_fee_percentage: { type: "string" },
          liquidity: { type: "string" },
          fees_24h: { type: "number" },
          today_fees: { type: "number" },
          trade_volume_24h: { type: "number" },
          cumulative_trade_volume: { type: "string" },
          cumulative_fee_volume: { type: "string" },
          current_price: { type: "number" },
          apr: { type: "number" },
          apy: { type: "number" },
          fees: {
            type: "object",
            properties: {
              min_30: { type: "number" },
              hour_1: { type: "number" },
              hour_2: { type: "number" },
              hour_4: { type: "number" },
              hour_12: { type: "number" },
              hour_24: { type: "number" }
            }
          },
          fee_tvl_ratio: {
            type: "object",
            properties: {
              min_30: { type: "number" },
              hour_1: { type: "number" },
              hour_2: { type: "number" },
              hour_4: { type: "number" },
              hour_12: { type: "number" },
              hour_24: { type: "number" }
            }
          },
          volume: {
            type: "object",
            properties: {
              min_30: { type: "number" },
              hour_1: { type: "number" },
              hour_2: { type: "number" },
              hour_4: { type: "number" },
              hour_12: { type: "number" },
              hour_24: { type: "number" }
            }
          }
        }
      }
    }
  },

  MeteoraAddLiquidityNewTool: {
    type: "object",
    required: [
      "toolName","poolName","finalAmountOfSolOnPosition",
      "addedtokenX","amontX","addedtokenY","amontY"
    ],
    properties: {
      toolName: { type: "string", enum: ["ADD_METEORA_LIQUIDITY"] },
      poolName: { type: "string" },
      finalAmountOfSolOnPosition: { type: "number" },
      addedtokenX: { type: "string" },
      amontX: { type: "number", description: "опечатка в коде: amontX" },
      addedtokenY: { type: "string" },
      amontY: { type: "number", description: "опечатка в коде: amontY" }
    }
  },

  MeteoraAddLiquidityExistingTool: {
    type: "object",
    required: [
      "toolName","poolName","finalAmountOfSolOnPosition",
      "addedtokenX","amontX","addedtokenY","amontY","id"
    ],
    properties: {
      toolName: { type: "string", enum: ["ADD_METEORA_LIQUIDITY"] },
      poolName: { type: "string" },
      finalAmountOfSolOnPosition: { type: "number" },
      addedtokenX: { type: "string" },
      amontX: { type: "number" },
      addedtokenY: { type: "string" },
      amontY: { type: "number" },
      id: { type: "string", description: "tx signature" }
    }
  },

  MeteoraRemoveLiquidityTool: {
    type: "object",
    required: ["toolName","poolName","finalAmountOfSolOnPosition","id"],
    properties: {
      toolName: { type: "string", enum: ["REMOVE_METEORA_LIQUIDITY"] },
      poolName: { type: "string" },
      finalAmountOfSolOnPosition: { type: "number" },
      id: {
        type: "array",
        items: { type: "string" },
        description: "список сигнатур транзакций remove"
      }
    }
  },

  KaminoDepositTool: {
    type: "object",
    required: ["toolName","status","transactionId","operation","token","amount"],
    properties: {
      toolName: { type: "string", enum: ["KAMINO_LEND_DEPOSIT"] },
      status: { type: "string", enum: ["success"] },
      transactionId: { type: "string" },
      operation: { type: "string", enum: ["deposit"] },
      token: { type: "string" },
      amount: { type: "number" }
    }
  },
  KaminoWithdrawTool: {
    type: "object",
    required: ["toolName","status","transactionId","operation","token","amount"],
    properties: {
      toolName: { type: "string", enum: ["KAMINO_LEND_WITHDRAW"] },
      status: { type: "string", enum: ["success"] },
      transactionId: { type: "string" },
      operation: { type: "string", enum: ["withdraw"] },
      token: { type: "string" },
      amount: { type: "number" }
    }
  },
  KaminoBorrowTool: {
    type: "object",
    required: ["toolName","status","transactionId","operation","token","amount"],
    properties: {
      toolName: { type: "string", enum: ["KAMINO_LEND_BORROW"] },
      status: { type: "string", enum: ["success"] },
      transactionId: { type: "string" },
      operation: { type: "string", enum: ["borrow"] },
      token: { type: "string" },
      amount: { type: "number" }
    }
  },
  KaminoRepayTool: {
    type: "object",
    required: ["toolName","status","transactionId","operation","token","amount"],
    properties: {
      toolName: { type: "string", enum: ["KAMINO_LEND_REPAY"] },
      status: { type: "string", enum: ["success"] },
      transactionId: { type: "string" },
      operation: { type: "string", enum: ["repay"] },
      token: { type: "string" },
      amount: { type: "number" }
    }
  },

  UnknownTool: {
    type: "object",
    required: ["toolName"],
    properties: {
      toolName: { type: "string" },
    },
    additionalProperties: true,
    description: "Запасной вариант для новых/неописанных инструментов"
  },

          BalanceResponse: {
              type: "object",
              additionalProperties: false,
              required: ["phantomBalance", "kaelusBalance"],
              properties: {
                  phantomBalance: { type: "string", example: "0.03451045" },
                  kaelusBalance: { $ref: "#/components/schemas/KaelusBalance" }
              }
          },
          KaelusBalance: {
              type: "object",
              additionalProperties: false,
              required: ["breakdown"],
              properties: {
                  breakdown: {
                      type: "array",
                      items: { $ref: "#/components/schemas/KaelusBalanceItem" }
                  },
                  totalUsd: { type: "number", format: "float", example: 1523.77 },
                  tokens: {
                      type: "array",
                      items: { $ref: "#/components/schemas/KaelusTokenPosition" }
                  }
              }
          },
          KaelusBalanceItem: {
              type: "object",
              additionalProperties: false,
              required: ["address", "balance"],
              properties: {
                  symbol:  { type: "string", nullable: true },
                  address: { type: "string" },
                  name:    { type: "string", nullable: true },
                  logoURI: { type: "string", nullable: true },
                  balance: { type: "number", format: "float" },
                  decimals:{ type: "integer", nullable: true }
              }
          },
          KaelusTokenPosition: {
              type: "object",
              additionalProperties: false,
              required: ["symbol", "address", "name", "balance", "valueUsd"],
              properties: {
                  symbol: { type: "string" },
                  address:{ type: "string" },
                  name:   { type: "string" },
                  balance:{ type: "number", format: "float" },
                  priceUsd:{ type: "number", format: "float", nullable: true },
                  valueUsd:{ type: "number", format: "float" },
                  logoURI: { type: "string", nullable: true }
              }
          },

  TransferRequest: {
    type: "object",
    required: ["amount", "from", "publicKey"],
    properties: {
      amount: { type: "number" },
      from: { type: "string", enum: ["kaelus", "phantom"] },
      publicKey: { type: "string" },
      priorityFee: { type: "number", default: 0 }
    }
  },

  TransferResponseKaelus: {
    type: "object",
    required: ["status"],
    properties: { status: { type: "string", enum: ["ok"] } }
  },

  TransferResponsePhantom: {
    type: "object",
    required: ["publicKey"],
    properties: { publicKey: { type: "string" } }
  },

  FriendsResponse: {
    type: "array",
    items: { type: "object", additionalProperties: true }
  },

  TrendingResponse: {
    type: "object",
    required: ["asOf", "items"],
    properties: {
      asOf: { type: "string" },
      items: {
        type: "array",
        items: {
          type: "object",
          required: ["mint","name","symbol","image","change24h","priceUsd","marketCapUsd"],
          properties: {
            mint: { type: "string" },
            name: { type: "string" },
            symbol: { type: "string" },
            image: { type: "string" },
            change24h: { type: "number" },
            priceUsd: { type: "number" },
            marketCapUsd: { type: "number" }
          }
        }
      }
    }
  },
        KaminoPositionItem: {
          type: "object",
          properties: {
            symbol: { type: "string" },
            mint: { type: "string" },
            amount: { type: ["number", "null"] },
            amountUsd: { type: ["number", "null"] }
          },
          required: ["symbol", "mint"]
        },

        KaminoPositions: {
          type: "object",
          properties: {
            deposits: { type: "array", items: { $ref: "#/components/schemas/KaminoPositionItem" } },
            borrows:  { type: "array", items: { $ref: "#/components/schemas/KaminoPositionItem" } },
            summary: {
              type: "object",
              properties: {
                deposited: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      symbol: { type: "string" },
                      amount: { type: "number" }
                    },
                    required: ["symbol", "amount"]
                  }
                },
                borrowed: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      symbol: { type: "string" },
                      amount: { type: "number" }
                    },
                    required: ["symbol", "amount"]
                  }
                }
              }
            }
          },
          required: ["deposits", "borrows", "summary"]
        },

        KaminoHealth: {
          type: "object",
          properties: {
            ltv: { type: "number", description: "Loan-to-Value in percent (0–100, rounded to 2 decimals)" },
            liquidationLtv: { type: "number", description: "Liquidation LTV in percent (0–100, rounded to 2 decimals)" },
            borrowLimitUsd: { type: "number" },
            netAccountValueUsd: { type: "number" }
          }
        },

        KaminoReserveItem: {
          type: "object",
          properties: {
            symbol: { type: "string" },
            reserveAddress: { type: "string" },
            liquidityMint: { type: ["string", "null"] },
            supplyApy: { type: ["number", "null"], description: "Percent, rounded to 2 decimals" },
            borrowApy:  { type: ["number", "null"], description: "Percent, rounded to 2 decimals" },
            utilization: { type: ["number", "null"], description: "Percent, rounded to 2 decimals" },
            ltv: { type: ["number", "null"], description: "Percent, rounded to 2 decimals" },
            liquidationLtv: { type: ["number", "null"], description: "Percent, rounded to 2 decimals" }
          },
          required: ["symbol", "reserveAddress"]
        },

        KaminoTotals: {
          type: "object",
          properties: {
            depositsUsd: { type: ["number", "null"] },
            borrowsUsd: { type: ["number", "null"] }
          }
        },

        KaminoSummaryResponse: {
          type: "object",
          properties: {
            userAddress: { type: "string" },
            market: { type: "string" },
            health: { $ref: "#/components/schemas/KaminoHealth" },
            positions: { $ref: "#/components/schemas/KaminoPositions" },
            totals: { $ref: "#/components/schemas/KaminoTotals" },
            reserves: {
              type: "array",
              items: { $ref: "#/components/schemas/KaminoReserveItem" }
            },
            asOf: { type: "integer", description: "Unix ms" },
            asOfIso: { type: "string", format: "date-time" }
          },
          required: ["userAddress", "market", "positions", "totals", "asOf"]
        },

  ActivityResponse: {
    type: "object",
    properties: {
      items: { type: "array", items: { type: "object", additionalProperties: true } }
    }
  }

      },
    },
  },
  apis: ["./src/**/*.ts"],
});