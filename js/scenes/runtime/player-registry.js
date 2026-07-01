export function createPlayerRegistry(entries = []) {
  const players = new Map(entries);

  return {
    register(id, player) {
      if (!id) throw new Error('Player registry requires an id');
      if (!player?.play) throw new Error(`Player ${id} must expose play()`);
      players.set(id, player);
      return player;
    },
    get(id) {
      return players.get(id) || null;
    },
    ids() {
      return [...players.keys()];
    }
  };
}
