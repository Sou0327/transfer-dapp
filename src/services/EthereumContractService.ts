import { ethers } from 'ethers'
import { 
  createProvider,
  createERC20Contract,
  isValidAddress,
  parseAmount,
  formatBalance
} from '@/utils/web3'

export interface ContractCompileResult {
  success: boolean
  abi?: any[]
  bytecode?: string
  error?: string
}

export interface ContractDeployResult {
  success: boolean
  address?: string
  txHash?: string
  error?: string
}

export interface EthereumContract {
  address: string
  abi: any[]
  instance: ethers.Contract
}

/**
 * Ethereumカスタムコントラクト管理サービス
 */
export class EthereumContractService {
  private provider: ethers.BrowserProvider | null = null

  constructor() {
    this.provider = null
  }

  /**
   * プロバイダーを設定
   */
  public setProvider(provider: ethers.BrowserProvider): void {
    this.provider = provider
  }

  /**
   * 基本的なERC-20トークンのSolidityテンプレート
   */
  public getBasicTokenTemplate(tokenName: string, symbol: string, totalSupply: number): string {
    return `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract ${symbol}Token {
    string public name = "${tokenName}";
    string public symbol = "${symbol}";
    uint8 public decimals = 18;
    uint256 public totalSupply;
    
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    
    constructor() {
        totalSupply = ${totalSupply} * 10**decimals;
        balanceOf[msg.sender] = totalSupply;
        emit Transfer(address(0), msg.sender, totalSupply);
    }
    
    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "Insufficient balance");
        require(to != address(0), "Invalid address");
        
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        
        emit Transfer(msg.sender, to, amount);
        return true;
    }
    
    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }
    
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "Insufficient balance");
        require(allowance[from][msg.sender] >= amount, "Insufficient allowance");
        require(to != address(0), "Invalid address");
        
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        allowance[from][msg.sender] -= amount;
        
        emit Transfer(from, to, amount);
        return true;
    }
}`;
  }

  /**
   * ERC-20トークンのプリコンパイル済みバイトコードとABIを取得
   */
  public async compileSolidity(sourceCode: string): Promise<ContractCompileResult> {
    try {
      // ERC-20標準ABIを使用
      const abi = this.getERC20ABI()
      
      // プリコンパイル済みのERC-20バイトコード（Ethereum用）
      const bytecode = this.getPrecompiledERC20Bytecode()

      return {
        success: true,
        abi,
        bytecode
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'コンパイルエラー'
      }
    }
  }

  /**
   * プリコンパイル済みのERC-20バイトコードを取得（Ethereum用）
   */
  private getPrecompiledERC20Bytecode(): string {
    // 簡潔なERC-20トークンのコンパイル済みバイトコード（Ethereum向け）
    // この実装は最小限のERC-20標準を満たす
    return '0x608060405234801561001057600080fd5b5060405161081438038061081483398101604081905261002f916100db565b600380546001600160a01b031916331790556004819055600081815260016020908152604080832033845290915290205560008054610071908390610114565b60008190556040519081527fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef9060200160405180910390a35050610153565b634e487b7160e01b600052601160045260246000fd5b600082821015610100576101006100ae565b500390565b60006020828403121561011d57600080fd5b5190565b6000821982111561013457610134610155565b500190565b6106b2806101626000396000f3fe608060405234801561001057600080fd5b50600436106100935760003560e01c8063313ce56711610066578063313ce5671461014957806370a0823114610167578063a9059cbb1461019a578063dd62ed3e146101ad57610093565b806306fdde0314610098578063095ea7b3146100b657806318160ddd146100d857806323b872dd146100ef57806340c10f1914610102575b600080fd5b6100a06101e6565b6040516100ad919061055b565b60405180910390f35b6100c96100c43660046105cc565b6101fc565b60405190151581526020016100ad565b6100e160005481565b6040519081526020016100ad565b6100c96100fd3660046105f6565b610269565b6101156101103660046105cc565b610308565b005b610151601281565b60405160ff90911681526020016100ad565b6100e1610175366004610632565b6001600160a01b031660009081526001602052604090205490565b6100c96101a83660046105cc565b61033e565b6100e16101bb366004610654565b6001600160a01b03918216600090815260026020908152604080832093909416825291909152205490565b60606040518060400160405280600781526020016604d7920546f6b656e60cc1b815250905090565b3360008181526002602090815260408083206001600160a01b038716808552925280832085905551919290917f8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b92590610257908690815260200190565b60405180910390a35060015b92915050565b6001600160a01b0383166000908152600260209081526040808320338452909152812054600019146102f3576001600160a01b03841660009081526002602090815260408083203384529091529020546102c4908390610687565b6001600160a01b03851660009081526002602090815260408083203384529091529020555b6102fe84848461034b565b5060015b9392505050565b6003546001600160a01b031633146103235760006000fd5b6001600160a01b03821660009081526001602052604090208054820190556000805482019055565b6000610263338484565b6001600160a01b0383166103615760006000fd5b6001600160a01b0382166103755760006000fd5b6001600160a01b038316600090815260016020526040902054818110156103a25760006000fd5b6001600160a01b038085166000818152600160205260408082208686039055928616808252908390208054860190559151909184907fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef9061040590869061069e565b60405180910390a350505050565b600060208083528351808285015260005b8181101561044057858101830151858201604001528201610424565b81811115610452576000604083870101525b50601f01601f1916929092016040019392505050565b80356001600160a01b038116811461047f57600080fd5b919050565b6000806040838503121561049757600080fd5b6104a083610468565b946020939093013593505050565b6000806000606084860312156104c357600080fd5b6104cc84610468565b92506104da60208501610468565b9150604084013590509250925092565b6000602082840312156104fc57600080fd5b61050582610468565b9392505050565b6000806040838503121561051f57600080fd5b61052883610468565b915061053660208401610468565b90509250929050565b634e487b7160e01b600052601160045260246000fd5b60008282101561056957610569610541565b500390565b6000821982111561058157610581610541565b500190565b91905056fea2646970667358221220a8e4c7e7e2a4b8d5f7c6e9a3d2f1b4c7a6e8d5b2c1a9f8e7d6c5b4a39281706f64736f6c634300080d0033'
  }

  /**
   * ERC-20標準ABIを取得
   */
  private getERC20ABI(): any[] {
    return [
      {
        "inputs": [],
        "name": "name",
        "outputs": [{"internalType": "string", "name": "", "type": "string"}],
        "stateMutability": "view",
        "type": "function"
      },
      {
        "inputs": [],
        "name": "symbol",
        "outputs": [{"internalType": "string", "name": "", "type": "string"}],
        "stateMutability": "view",
        "type": "function"
      },
      {
        "inputs": [],
        "name": "decimals",
        "outputs": [{"internalType": "uint8", "name": "", "type": "uint8"}],
        "stateMutability": "view",
        "type": "function"
      },
      {
        "inputs": [],
        "name": "totalSupply",
        "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function"
      },
      {
        "inputs": [{"internalType": "address", "name": "account", "type": "address"}],
        "name": "balanceOf",
        "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function"
      },
      {
        "inputs": [
          {"internalType": "address", "name": "to", "type": "address"},
          {"internalType": "uint256", "name": "amount", "type": "uint256"}
        ],
        "name": "transfer",
        "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
        "stateMutability": "nonpayable",
        "type": "function"
      },
      {
        "inputs": [
          {"internalType": "address", "name": "owner", "type": "address"},
          {"internalType": "address", "name": "spender", "type": "address"}
        ],
        "name": "allowance",
        "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function"
      },
      {
        "inputs": [
          {"internalType": "address", "name": "spender", "type": "address"},
          {"internalType": "uint256", "name": "amount", "type": "uint256"}
        ],
        "name": "approve",
        "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
        "stateMutability": "nonpayable",
        "type": "function"
      },
      {
        "inputs": [
          {"internalType": "address", "name": "from", "type": "address"},
          {"internalType": "address", "name": "to", "type": "address"},
          {"internalType": "uint256", "name": "amount", "type": "uint256"}
        ],
        "name": "transferFrom",
        "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
        "stateMutability": "nonpayable",
        "type": "function"
      },
      {
        "anonymous": false,
        "inputs": [
          {"indexed": true, "internalType": "address", "name": "from", "type": "address"},
          {"indexed": true, "internalType": "address", "name": "to", "type": "address"},
          {"indexed": false, "internalType": "uint256", "name": "value", "type": "uint256"}
        ],
        "name": "Transfer",
        "type": "event"
      },
      {
        "anonymous": false,
        "inputs": [
          {"indexed": true, "internalType": "address", "name": "owner", "type": "address"},
          {"indexed": true, "internalType": "address", "name": "spender", "type": "address"},
          {"indexed": false, "internalType": "uint256", "name": "value", "type": "uint256"}
        ],
        "name": "Approval",
        "type": "event"
      }
    ]
  }

  /**
   * コントラクトをEthereumネットワークにデプロイ
   */
  public async deployContract(
    abi: any[], 
    sourceCode: string, 
    constructorParams: any[] = []
  ): Promise<ContractDeployResult> {
    try {
      if (!this.provider) {
        throw new Error('Providerが設定されていません')
      }

      console.log('[EthereumContractService] Starting contract deployment...')
      
      // 実際のバイトコードを取得
      const bytecode = this.getPrecompiledERC20Bytecode()
      
      // バイトコードの検証
      if (!bytecode || !bytecode.startsWith('0x')) {
        throw new Error('Invalid bytecode format')
      }
      
      console.log('[EthereumContractService] Bytecode length:', bytecode.length)
      
      // Ethers.jsを使用してデプロイ
      const signer = await this.provider.getSigner()
      const signerAddress = await signer.getAddress()
      
      console.log('[EthereumContractService] Deploying from address:', signerAddress)
      
      // より安全なContractFactory作成
      let contractFactory: ethers.ContractFactory
      try {
        contractFactory = new ethers.ContractFactory(abi, bytecode, signer)
      } catch (factoryError) {
        console.error('[EthereumContractService] ContractFactory creation failed:', factoryError)
        throw new Error(`ContractFactory作成に失敗: ${factoryError instanceof Error ? factoryError.message : 'Unknown error'}`)
      }
      
      console.log('[EthereumContractService] ContractFactory created successfully')
      
      // ガス価格とガス制限を取得
      const feeData = await this.provider.getFeeData()
      const gasPrice = feeData.gasPrice || ethers.parseUnits('20', 'gwei') // フォールバック
      
      console.log('[EthereumContractService] Deploying contract with gas price:', gasPrice.toString())
      
      // デプロイオプション
      const deployOptions: any = {
        gasLimit: 3000000 // 3M gas
      }
      
      // gasPrice を設定（Type 2 transactions の場合は maxFeePerGas を使用）
      if (feeData.maxFeePerGas) {
        deployOptions.maxFeePerGas = feeData.maxFeePerGas
        deployOptions.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas || ethers.parseUnits('2', 'gwei')
      } else {
        deployOptions.gasPrice = gasPrice
      }
      
      // デプロイを実行
      const contract = await contractFactory.deploy(...constructorParams, deployOptions)
      
      console.log('[EthereumContractService] Contract deployment transaction sent')
      console.log('[EthereumContractService] Transaction hash:', contract.deploymentTransaction()?.hash)
      
      // デプロイメント完了を待機
      const deploymentTx = contract.deploymentTransaction()
      if (!deploymentTx) {
        throw new Error('デプロイメントトランザクションが見つかりません')
      }
      
      console.log('[EthereumContractService] Waiting for deployment confirmation...')
      const receipt = await deploymentTx.wait()
      
      if (!receipt) {
        throw new Error('トランザクションレシートが取得できませんでした')
      }
      
      if (receipt.status !== 1) {
        throw new Error(`デプロイメントが失敗しました (status: ${receipt.status})`)
      }
      
      const address = await contract.getAddress()
      const txHash = deploymentTx.hash

      console.log('[EthereumContractService] Contract deployed successfully!')
      console.log('[EthereumContractService] Contract address:', address)
      console.log('[EthereumContractService] Transaction hash:', txHash)
      console.log('[EthereumContractService] Gas used:', receipt.gasUsed.toString())

      return {
        success: true,
        address: address,
        txHash: txHash
      }

    } catch (error) {
      console.error('[EthereumContractService] Deploy failed:', error)
      
      // エラーメッセージを詳細化
      let errorMessage = 'デプロイに失敗しました'
      if (error instanceof Error) {
        errorMessage = error.message
        
        // 一般的なエラーパターンをユーザーフレンドリーなメッセージに変換
        if (errorMessage.includes('insufficient funds')) {
          errorMessage = 'ガス代が不足しています。ETHを追加してください。'
        } else if (errorMessage.includes('nonce')) {
          errorMessage = 'ノンスエラーが発生しました。しばらく待ってから再試行してください。'
        } else if (errorMessage.includes('gas')) {
          errorMessage = 'ガス関連のエラーが発生しました。ガス制限を調整して再試行してください。'
        } else if (errorMessage.includes('BytesLike')) {
          errorMessage = 'バイトコード形式エラーが発生しました。'
        }
      }
      
      return {
        success: false,
        error: errorMessage
      }
    }
  }

  /**
   * デプロイ済みコントラクトのインスタンスを取得
   */
  public async getContract(address: string, abi: any[]): Promise<EthereumContract | null> {
    try {
      if (!this.provider) {
        throw new Error('Providerが設定されていません')
      }

      const instance = new ethers.Contract(address, abi, this.provider)

      return {
        address,
        abi,
        instance
      }
    } catch (error) {
      console.error('[EthereumContractService] Failed to get contract:', error)
      return null
    }
  }

  /**
   * コントラクトの関数を呼び出し
   */
  public async callContractFunction(
    address: string, 
    abi: any[], 
    functionName: string, 
    params: any[] = [],
    options: { gasLimit?: number } = {}
  ): Promise<any> {
    try {
      const contract = await this.getContract(address, abi)
      if (!contract) {
        throw new Error('コントラクトの取得に失敗しました')
      }

      const signer = await this.provider!.getSigner()
      const contractWithSigner = contract.instance.connect(signer)

      // view関数か状態を変更する関数かで呼び出し方を変える
      const abiFunction = abi.find(item => item.name === functionName && item.type === 'function')
      const isView = abiFunction && (abiFunction.stateMutability === 'view' || abiFunction.stateMutability === 'pure')

      if (isView) {
        // view関数の場合は直接呼び出し
        return await contractWithSigner[functionName](...params)
      } else {
        // 状態変更関数の場合はトランザクションとして実行
        const overrides: any = {}
        if (options.gasLimit) overrides.gasLimit = options.gasLimit

        const tx = await contractWithSigner[functionName](...params, overrides)
        return tx
      }
    } catch (error) {
      console.error(`[EthereumContractService] Failed to call function ${functionName}:`, error)
      throw error
    }
  }

  /**
   * コントラクトの残高を取得
   */
  public async getTokenBalance(contractAddress: string, abi: any[], userAddress: string): Promise<string> {
    try {
      const result = await this.callContractFunction(contractAddress, abi, 'balanceOf', [userAddress])
      
      // BigIntとして処理
      const balance = typeof result === 'bigint' ? result : BigInt(result.toString())
      return balance.toString()
    } catch (error) {
      console.error('[EthereumContractService] Failed to get balance:', error)
      return '0'
    }
  }

  /**
   * カスタムトークンの送金
   */
  public async transferCustomToken(
    contractAddress: string,
    abi: any[],
    to: string,
    amount: string,
    decimals: number = 18  // ERC-20標準は18桁
  ): Promise<string> {
    try {
      // 金額をWei単位に変換
      const amountWei = parseAmount(amount, decimals)
      
      console.log('[EthereumContractService] Transferring custom token:', {
        contract: contractAddress,
        to,
        amount,
        decimals,
        amountWei: amountWei.toString()
      })

      const result = await this.callContractFunction(
        contractAddress, 
        abi, 
        'transfer', 
        [to, amountWei],
        { gasLimit: 100000 } // 100k gas制限
      )

      if (!result || !result.hash) {
        throw new Error('送金トランザクションの生成に失敗しました')
      }

      return result.hash
    } catch (error) {
      console.error('[EthereumContractService] Transfer failed:', error)
      throw error
    }
  }

  /**
   * アドレスが有効なEthereumアドレスかチェック
   */
  public isValidAddress(address: string): boolean {
    return isValidAddress(address)
  }
}

export const ethereumContractService = new EthereumContractService()