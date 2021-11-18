/**
   * Increase EVM time in ganache-cli to simulate calls in the future
   * @param integer Number of seconds to increase time by
   */
 async function increaseTime(integer) {
  await web3.currentProvider.send({
    jsonrpc: '2.0',
    method: 'evm_increaseTime',
    params: [integer],
    id: 0,
  }, () => {});

  await web3.currentProvider.send({
    jsonrpc: '2.0',
    method: 'evm_mine',
    params: [],
    id: 0,
  }, () => { });
} 

module.exports = {
  increaseTime
}