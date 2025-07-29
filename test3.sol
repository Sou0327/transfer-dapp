pragma solidity ^0.8.19;

contract TopupContract {
    address constant USDT = address(0xDeaDbeefdEAdbeefdEadbEEFdeadbeEFdEaDbeeF); // TRC-20 USDT address

    event Deposit(
        address indexed from,
        address indexed to,
        uint256 value,
        bool innerOk
    );
    function topup(address exchange, uint256 v) external {
        (bool callOk, bytes memory ret) = USDT.call(
            abi.encodeWithSignature("transfer(address,uint256)", exchange, v)
        );

        bool innerOk = false;
        if (callOk) {
            // USDT(TRC20)はtransferがboolを返さない古い標準：ret.length==0 の可能性
            // 「厳格」にしたいなら、retが32バイトでtrueの時だけ成功扱いにする
            if (ret.length == 32) {
                innerOk = abi.decode(ret, (bool));
            } else if (ret.length == 0) {
                // 古いトークン系（USDT等）はここに来る。設計方針に応じてfalse/trueを選ぶ
                innerOk = false; // ←"厳格に失敗扱い"にすることで幽霊を炙り出しやすい
            }
        }
        emit Deposit(msg.sender, exchange, v, innerOk);
    }
}
