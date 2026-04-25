declare module "snarkjs" {
  export const groth16: {
    verify(
      vk: object,
      publicSignals: string[],
      proof: object,
    ): Promise<boolean>;
    fullProve(
      input: Record<string, string | string[]>,
      wasmFile: string,
      zkeyFileName: string,
    ): Promise<{ proof: object; publicSignals: string[] }>;
  };
}
