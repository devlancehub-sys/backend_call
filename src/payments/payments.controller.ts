import { Controller, Post, Body, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { VerifyPaymentDto } from './dto/verify-payment.dto';

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  constructor(private paymentsService: PaymentsService) {}

  @Post('create-order')
  @ApiOperation({ summary: 'Create Razorpay order' })
  @ApiResponse({ status: 200, description: 'Order created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid amount (minimum 100 paise)' })
  @ApiResponse({ status: 401, description: 'Invalid Razorpay credentials' })
  @ApiResponse({ status: 500, description: 'Failed to create order' })
  async createOrder(@Body() createOrderDto: CreateOrderDto) {
    if (createOrderDto.amount < 100) {
      throw new BadRequestException('Minimum amount is 100 paise');
    }

    return this.paymentsService.createOrder(
      createOrderDto.amount,
      createOrderDto.currency || 'INR',
      createOrderDto.receipt,
    );
  }

  @Post('verify-payment')
  @ApiOperation({ summary: 'Verify Razorpay payment signature' })
  @ApiResponse({ status: 200, description: 'Payment verified successfully' })
  @ApiResponse({ status: 400, description: 'Invalid signature or missing fields' })
  async verifyPayment(@Body() verifyPaymentDto: VerifyPaymentDto) {
    const isValid = this.paymentsService.verifyPayment(
      verifyPaymentDto.razorpay_order_id,
      verifyPaymentDto.razorpay_payment_id,
      verifyPaymentDto.razorpay_signature,
    );

    if (!isValid) {
      throw new BadRequestException('Invalid payment signature');
    }

    return {
      success: true,
      message: 'Payment verified successfully',
    };
  }
}
