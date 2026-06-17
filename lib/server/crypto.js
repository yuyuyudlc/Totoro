import { constants, publicEncrypt } from 'node:crypto';

const RSA_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDU/j+c5FdkEwhSIF9jmw+050iN
0/yfjhk/669RyFiG5wu0Adpk3NR2Ikbo2lA+rTBJBx1bpGVGCvMKKQ/pljNUSmJt
JaM5ieONFrZD6RhSUbjrNENH89Ks9GGWi+1dkOfdSHNujQilF5oLOIHez1HYmwml
ADA29Ux4yb8e4+PtLQIDAQAB
-----END PUBLIC KEY-----`;

const RSA_BLOCK_SIZE = 117;

export function rsaEncrypt(data) {
  const json = JSON.stringify(data);
  const bytes = Buffer.from(json, 'utf8');
  const chunks = [];

  for (let offset = 0; offset < bytes.length; offset += RSA_BLOCK_SIZE) {
    const chunk = bytes.subarray(offset, offset + RSA_BLOCK_SIZE);
    chunks.push(
      publicEncrypt(
        {
          key: RSA_PUBLIC_KEY_PEM,
          padding: constants.RSA_PKCS1_PADDING,
        },
        chunk
      )
    );
  }

  return Buffer.concat(chunks).toString('base64');
}
