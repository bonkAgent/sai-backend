export function enoughMoney(balances: any[], amount: number, tokenAddress:string,fee:number): boolean{
  const tokens = balances.filter(balance => balance.address === tokenAddress);
  if(tokens.length != 1){
    return false;
  }
  const token = tokens[0];
  if(token.address === "So11111111111111111111111111111111111111112"){
    if(token.balance < (Number(fee)+Number(amount))){
      return false;
    }else{
      return true;
    }
  }
  if(balances[0].balance > fee && token.balance > amount){
    return true;
  }
  return false;
}