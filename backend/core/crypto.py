"""
RSA 加密模块
用于龙猫 API 请求体加密
"""
import base64
import json
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.backends import default_backend

# RSA 公钥
RSA_PUBLIC_KEY_PEM = """-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDU/j+c5FdkEwhSIF9jmw+050iN
0/yfjhk/669RyFiG5wu0Adpk3NR2Ikbo2lA+rTBJBx1bpGVGCvMKKQ/pljNUSmJt
JaM5ieONFrZD6RhSUbjrNENH89Ks9GGWi+1dkOfdSHNujQilF5oLOIHez1HYmwml
ADA29Ux4yb8e4+PtLQIDAQAB
-----END PUBLIC KEY-----"""

# RSA 密钥长度和分段大小
RSA_KEY_SIZE = 1024
RSA_BLOCK_SIZE = 117  # 1024位密钥最大加密 117 字节


def load_public_key():
    """加载 RSA 公钥"""
    return serialization.load_pem_public_key(
        RSA_PUBLIC_KEY_PEM.encode('utf-8'),
        backend=default_backend()
    )


def rsa_encrypt(data: dict) -> str:
    """
    RSA 分段加密
    
    Args:
        data: 要加密的字典数据
        
    Returns:
        Base64 编码的加密字符串
    """
    # 将字典转为 JSON 字符串，再转为字节
    json_str = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
    data_bytes = json_str.encode('utf-8')
    
    # 加载公钥
    public_key = load_public_key()
    
    # 分段加密
    encrypted_chunks = []
    offset = 0
    
    while offset < len(data_bytes):
        # 取当前分段
        chunk = data_bytes[offset:offset + RSA_BLOCK_SIZE]
        
        # 使用 PKCS1v15 填充加密
        encrypted_chunk = public_key.encrypt(
            chunk,
            padding.PKCS1v15()
        )
        encrypted_chunks.append(encrypted_chunk)
        offset += RSA_BLOCK_SIZE
    
    # 合并所有加密分段
    encrypted_data = b''.join(encrypted_chunks)
    
    # Base64 编码
    return base64.b64encode(encrypted_data).decode('utf-8')
